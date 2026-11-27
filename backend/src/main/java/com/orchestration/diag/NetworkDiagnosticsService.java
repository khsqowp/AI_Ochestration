package com.orchestration.diag;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Flow;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.security.auth.x500.X500Principal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.Lookup;
import org.xbill.DNS.Name;
import org.xbill.DNS.Record;
import org.xbill.DNS.SimpleResolver;
import org.xbill.DNS.Type;

@Service
class NetworkDiagnosticsService {
  private static final int MAX_REDIRECTS = 5;
  private static final int MAX_RESPONSE_BYTES = 64_000;
  private static final int CERT_WARN_DAYS = 30;
  private static final int SUMMARY_LENGTH = 140;
  private static final String USER_AGENT = "Ochestration-NetworkDiagnostics/1.0 (+server-side connectivity check)";
  private static final Pattern ERROR_LINES = Pattern.compile("(?im)^.*(?:error|reason|timeout|failed|gateway|denied|failure|state).*$");
  private static final Pattern CN = Pattern.compile("(?:^|,)CN=((?:\\\\.|[^,])+)");
  private static final Pattern IPV4_LITERAL = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");
  /** 다른 통신사/퍼블릭 DNS에서만 생존 여부가 다르게 나오는 경우(특정 통신사 DNS 차단·스푸핑 등)를 잡기 위해
   * 시스템 기본 리졸버와 별개로 직접 질의하는 공개·국내 통신사 리졸버 목록. */
  private static final List<DnsResolverSpec> PUBLIC_DNS_RESOLVERS = List.of(
      new DnsResolverSpec("google", "8.8.8.8"),
      new DnsResolverSpec("cloudflare", "1.1.1.1"),
      new DnsResolverSpec("quad9", "9.9.9.9"),
      new DnsResolverSpec("opendns", "208.67.222.222"),
      new DnsResolverSpec("kt", "168.126.63.1"),
      new DnsResolverSpec("sk-broadband", "210.220.163.82"),
      new DnsResolverSpec("lg-uplus", "164.124.101.2"));

  private final ObjectMapper json;
  private final NetworkDiagnosticRunRepository runs;

  NetworkDiagnosticsService(ObjectMapper json, NetworkDiagnosticRunRepository runs) {
    this.json = json;
    this.runs = runs;
  }

  Response diagnose(Request request) throws Exception {
    if (request == null || request.target() == null || request.target().isBlank()) throw badRequest("target가 필요합니다.");
    if (request.target().length() > 255 || (request.ports() != null && request.ports().length() > 64)
        || (request.proxy() != null && request.proxy().length() > 255)) throw badRequest("target, ports, proxy 길이 제한을 초과했습니다.");
    int timeout = request.timeoutMs() == null ? 10_000 : request.timeoutMs();
    if (timeout < 500 || timeout > 60_000) throw badRequest("timeoutMs는 500~60000 범위여야 합니다.");
    Target target = parseTarget(request.target());
    List<Integer> ports = parsePorts(request.ports(), target.port());
    ProxySpec proxy = request.proxy() == null || request.proxy().isBlank() ? null : parseProxy(request.proxy());
    List<Step> steps = new ArrayList<>();

    long dnsStarted = System.nanoTime();
    boolean dnsOk;
    try {
      List<String> addresses = resolveAndValidate(target.uri());
      steps.add(new Step("dns", true, "성공: " + String.join(" ", addresses), elapsedSince(dnsStarted)));
      dnsOk = true;
    } catch (Exception exception) {
      if (exception instanceof SecurityException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "대상이 사설·로컬 주소로 해석되어 차단했습니다.");
      steps.add(new Step("dns", false, "실패: 주소를 찾지 못함", elapsedSince(dnsStarted)));
      dnsOk = false;
    }
    steps.addAll(multiResolverDnsSteps(target.host(), timeout));
    if (!dnsOk) return new Response(steps, verdictDns(target.host()), null, false, "Alt-Svc 미관측");

    List<Boolean> tcpOk = new ArrayList<>();
    for (int port : ports) {
      long started = System.nanoTime();
      boolean connected = false;
      String detail;
      try (Socket socket = new Socket()) {
        socket.connect(new InetSocketAddress(target.host(), port), timeout);
        connected = true;
        detail = port + "/tcp 연결 성공";
      } catch (Exception exception) {
        detail = port + "/tcp 실패/시간초과 또는 기능 사용불가";
      }
      tcpOk.add(connected);
      steps.add(new Step("tcp-" + port, connected, detail, elapsedSince(started)));
    }

    List<TlsCheck> tls = new ArrayList<>();
    for (int i = 0; i < ports.size(); i++) {
      int port = ports.get(i);
      if (!target.isHttps(port)) continue;
      long started = System.nanoTime();
      TlsCheck check = tcpOk.get(i) ? tlsCheck(target.host(), port, timeout) : TlsCheck.skipped(port);
      tls.add(check);
      steps.add(new Step("tls-" + port, check.success(), check.detail(), elapsedSince(started)));
    }

    List<HttpProbe> direct = new ArrayList<>();
    for (int port : ports) {
      long started = System.nanoTime();
      HttpProbe probe = probe(target.requestUri(port), timeout, null, true);
      direct.add(probe);
      steps.add(new Step("direct-http-" + port, probe.status() != 0, probe.detail(), elapsedSince(started)));
    }

    List<HttpProbe> proxied = new ArrayList<>();
    boolean sanityOk = false;
    boolean tunnel = false;
    if (proxy != null) {
      validateProxy(proxy);
      if (ports.contains(443)) tunnel = checkConnectTunnel(proxy, target.host(), timeout);
      for (int port : ports) {
        long started = System.nanoTime();
        HttpProbe probe = probe(target.requestUri(port), timeout, proxy, false);
        proxied.add(probe);
        steps.add(new Step("proxy-http-" + port, probe.status() != 0, probe.detail(), elapsedSince(started)));
      }
      long sanityStarted = System.nanoTime();
      HttpProbe sanity = probe(URI.create("https://www.example.com/"), timeout, proxy, false);
      sanityOk = sanity.status() != 0;
      steps.add(new Step("proxy-sanity", sanityOk, sanityOk ? "프록시 일반 인터넷 점검 성공: HTTP " + sanity.status() : "프록시 일반 인터넷 점검 실패/시간초과: " + sanity.detail(), elapsedSince(sanityStarted)));
    }
    boolean tlsSucceeded = tls.stream().anyMatch(TlsCheck::handshakeOk);
    Boolean http2 = tlsSucceeded ? tls.stream().anyMatch(check -> "h2".equals(check.applicationProtocol())) : null;
    boolean http3 = direct.stream().anyMatch(probe -> probe.altSvc().toLowerCase(Locale.ROOT).contains("h3"));
    String http3Detail = http3 ? "HTTP/3 지원 가능성 있음(Alt-Svc 헤더 관측; 실제 QUIC 핸드셰이크로 검증된 것 아님)" : "Alt-Svc h3 미관측(HTTP/3 미지원의 증거는 아님)";
    steps.add(new Step("http2-alpn", tlsSucceeded && Boolean.TRUE.equals(http2), tls.isEmpty() ? "HTTPS 포트 없음: ALPN 확인 불가" : !tlsSucceeded ? "TLS 핸드셰이크 실패: ALPN 확인 불가" : http2 ? "ALPN h2 협상 성공: HTTP/2 지원 확인" : "TLS 성공, h2 미협상: HTTP/2 미확인", 0));
    steps.add(new Step("http3-alt-svc", true, http3Detail, 0));
    return new Response(steps, verdict(target, ports, direct, proxied, proxy != null, sanityOk, tunnel, tcpOk, tls), http2, http3, http3Detail);
  }

  /** Runs a diagnosis and stores it in the caller's history. */
  Response diagnoseAndPersist(Request request, UUID userId) throws Exception {
    Response response = diagnose(request);
    String ports = request.ports() == null || request.ports().isBlank() ? "80,443" : request.ports().trim();
    String proxy = request.proxy() == null || request.proxy().isBlank() ? null : request.proxy().trim();
    int timeoutMs = request.timeoutMs() == null ? 10_000 : request.timeoutMs();
    runs.save(new NetworkDiagnosticRunRecord(userId, request.target().trim(), ports, proxy, timeoutMs,
        json.writeValueAsString(response.steps()), response.verdict()));
    return response;
  }

  List<RunSummary> history(UUID userId) {
    return runs.findTop50ByRequestedByUserIdOrderByCreatedAtDesc(userId).stream()
        .map(run -> new RunSummary(run.getId(), run.getTarget(), run.getPorts(), snippet(run.getVerdict()), run.getCreatedAt()))
        .toList();
  }

  RunDetail detail(UUID id, UUID userId) {
    NetworkDiagnosticRunRecord run = owned(id, userId);
    return new RunDetail(run.getId(), run.getTarget(), run.getPorts(), run.getProxy(), run.getTimeoutMs(),
        readSteps(run.getStepsJson()), run.getVerdict(), run.getCreatedAt());
  }

  Response rerun(UUID id, UUID userId) throws Exception {
    NetworkDiagnosticRunRecord run = owned(id, userId);
    return diagnoseAndPersist(new Request(run.getTarget(), run.getPorts(), run.getTimeoutMs(), run.getProxy()), userId);
  }

  void delete(UUID id, UUID userId) {
    runs.delete(owned(id, userId));
  }

  private NetworkDiagnosticRunRecord owned(UUID id, UUID userId) {
    return runs.findById(id)
        .filter(run -> run.getRequestedByUserId().equals(userId))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "진단 기록을 찾을 수 없습니다."));
  }

  private List<Step> readSteps(String stepsJson) {
    try {
      return json.readValue(stepsJson, new TypeReference<List<Step>>() {});
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("stored network diagnostic steps are unreadable", exception);
    }
  }

  private static String snippet(String verdict) {
    return verdict.length() <= SUMMARY_LENGTH ? verdict : verdict.substring(0, SUMMARY_LENGTH) + "...";
  }

  private static long elapsedSince(long startNanos) {
    return (System.nanoTime() - startNanos) / 1_000_000;
  }

  private HttpProbe probe(URI initial, int timeoutMs, ProxySpec proxy, boolean validateTarget) {
    URI current = initial;
    try {
      for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (validateTarget) resolveAndValidate(current);
        HttpClient.Builder builder = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(timeoutMs)).followRedirects(HttpClient.Redirect.NEVER);
        if (proxy != null) builder.proxy(ProxySelector.of(new InetSocketAddress(proxy.host(), proxy.port())));
        else builder.proxy(new DirectProxySelector());
        HttpRequest request = HttpRequest.newBuilder(current)
            .timeout(Duration.ofMillis(timeoutMs))
            .header("User-Agent", USER_AGENT)
            .header("Accept", "*/*")
            .GET().build();
        HttpResponse<byte[]> response = builder.build().send(request, info -> new BoundedBodySubscriber());
        int status = response.statusCode();
        String snippet = status >= 400 ? matchingLines(new String(response.body(), StandardCharsets.UTF_8)) : "";
        String detail = "HTTP " + status + (snippet.isBlank() ? "" : " · 오류 본문 관련 부분: " + snippet);
        String altSvc = response.headers().firstValue("alt-svc").orElse("");
        if (status < 300 || status >= 400) return new HttpProbe(status, detail, altSvc);
        URI location = response.headers().firstValue("location").map(current::resolve).orElseThrow(() -> new IOException("redirect response without a Location header"));
        current = location;
      }
      return new HttpProbe(0, "실패: 리다이렉트 한도 초과(>" + MAX_REDIRECTS + ")", "");
    } catch (Exception exception) {
      return new HttpProbe(0, "실패/시간초과: " + shortError(exception), "");
    }
  }

  /** Raw TLS handshake (not via HttpClient) to read negotiated parameters and the leaf certificate. */
  private TlsCheck tlsCheck(String host, int port, int timeoutMs) {
    try (Socket plain = new Socket()) {
      plain.connect(new InetSocketAddress(host, port), timeoutMs);
      plain.setSoTimeout(timeoutMs);
      SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
      try (SSLSocket ssl = (SSLSocket) factory.createSocket(plain, host, port, true)) {
        ssl.setSoTimeout(timeoutMs);
        javax.net.ssl.SSLParameters parameters = ssl.getSSLParameters();
        parameters.setApplicationProtocols(new String[] {"h2", "http/1.1"});
        ssl.setSSLParameters(parameters);
        ssl.startHandshake();
        SSLSession session = ssl.getSession();
        X509Certificate leaf = (X509Certificate) session.getPeerCertificates()[0];
        Instant notAfter = leaf.getNotAfter().toInstant();
        Instant now = Instant.now();
        boolean expired = notAfter.isBefore(now);
        long daysLeft = Duration.between(now, notAfter).toDays();
        boolean certWarning = expired || daysLeft < CERT_WARN_DAYS;
        String certText = "인증서 CN=" + commonName(leaf.getSubjectX500Principal())
            + " · 발급자 CN=" + commonName(leaf.getIssuerX500Principal())
            + " · 만료 " + notAfter
            + (expired ? " (만료됨)" : " (" + daysLeft + "일 남음)");
        String applicationProtocol = ssl.getApplicationProtocol();
        String detail = "TLS 핸드셰이크 성공 · ALPN " + (applicationProtocol.isBlank() ? "미협상" : applicationProtocol) + " · " + session.getProtocol() + " · " + session.getCipherSuite() + " · " + certText;
        if (expired) detail += " · 경고: 인증서가 만료되었습니다";
        else if (certWarning) detail += " · 경고: " + CERT_WARN_DAYS + "일 이내 만료 예정";
        return new TlsCheck(port, true, true, !certWarning, certWarning, detail, expired ? "인증서 만료됨" : "인증서 " + daysLeft + "일 후 만료", applicationProtocol);
      }
    } catch (Exception exception) {
      return new TlsCheck(port, true, false, false, false, "TLS 핸드셰이크 실패: " + shortError(exception), "", "");
    }
  }

  private static String commonName(X500Principal principal) {
    Matcher matcher = CN.matcher(principal.getName(X500Principal.RFC2253));
    return matcher.find() ? matcher.group(1) : principal.getName();
  }

  /** Resolves the host independently against several public/국내 통신사 DNS 리졸버 in parallel, plus a
   * final 비교 단계 that flags when resolvers disagree (per-resolver DNS 차단/스푸핑 정황). Skipped for
   * literal IP targets since there is nothing to resolve. */
  private List<Step> multiResolverDnsSteps(String host, int timeoutMs) {
    if (IPV4_LITERAL.matcher(host).matches() || host.contains(":")) return List.of();
    int perResolverTimeoutMs = Math.min(timeoutMs, 4000);
    List<CompletableFuture<ResolverOutcome>> futures = new ArrayList<>();
    try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
      for (DnsResolverSpec spec : PUBLIC_DNS_RESOLVERS) {
        futures.add(CompletableFuture.supplyAsync(() -> resolveViaResolver(host, spec, perResolverTimeoutMs), executor));
      }
      List<ResolverOutcome> outcomes = futures.stream().map(CompletableFuture::join).toList();
      List<Step> steps = new ArrayList<>();
      for (ResolverOutcome outcome : outcomes) steps.add(new Step("dns-" + outcome.spec().name(), outcome.success(), outcome.detail(), outcome.elapsedMs()));
      steps.add(dnsDivergenceStep(outcomes));
      return steps;
    }
  }

  private ResolverOutcome resolveViaResolver(String host, DnsResolverSpec spec, int timeoutMs) {
    long started = System.nanoTime();
    try {
      SimpleResolver resolver = new SimpleResolver(spec.ip());
      resolver.setTimeout(Duration.ofMillis(timeoutMs));
      Lookup lookup = new Lookup(Name.fromString(host, Name.root), Type.A);
      lookup.setResolver(resolver);
      lookup.setCache(null);
      Record[] answers = lookup.run();
      if (lookup.getResult() == Lookup.SUCCESSFUL && answers != null) {
        List<String> addresses = Arrays.stream(answers)
            .filter(record -> record instanceof ARecord)
            .map(record -> ((ARecord) record).getAddress().getHostAddress())
            .distinct().toList();
        String detail = spec.ip() + " · " + (addresses.isEmpty() ? "응답은 받았지만 A 레코드 없음" : "성공: " + String.join(" ", addresses));
        return new ResolverOutcome(spec, !addresses.isEmpty(), addresses, detail, elapsedSince(started));
      }
      String reason = switch (lookup.getResult()) {
        case Lookup.HOST_NOT_FOUND -> "NXDOMAIN (해당 DNS는 존재하지 않는 도메인으로 응답)";
        case Lookup.TYPE_NOT_FOUND -> "A 레코드 없음";
        case Lookup.TRY_AGAIN -> "서버 응답 지연/일시 오류";
        case Lookup.UNRECOVERABLE -> "조회 불가(설정 오류)";
        default -> lookup.getErrorString();
      };
      return new ResolverOutcome(spec, false, List.of(), spec.ip() + " · 실패: " + reason, elapsedSince(started));
    } catch (Exception exception) {
      return new ResolverOutcome(spec, false, List.of(), spec.ip() + " · 실패/시간초과: " + shortError(exception), elapsedSince(started));
    }
  }

  private Step dnsDivergenceStep(List<ResolverOutcome> outcomes) {
    long started = System.nanoTime();
    List<ResolverOutcome> succeeded = outcomes.stream().filter(ResolverOutcome::success).toList();
    if (succeeded.size() < 2) {
      return new Step("dns-compare", !succeeded.isEmpty(),
          "비교할 성공 응답이 2개 미만입니다(" + succeeded.size() + "/" + outcomes.size() + " 개 리졸버 성공).", elapsedSince(started));
    }
    Map<TreeSet<String>, List<String>> byAddresses = new LinkedHashMap<>();
    for (ResolverOutcome outcome : succeeded) byAddresses.computeIfAbsent(new TreeSet<>(outcome.addresses()), key -> new ArrayList<>()).add(outcome.spec().name());
    if (byAddresses.size() <= 1) {
      return new Step("dns-compare", true, succeeded.size() + "개 DNS 리졸버 전체가 동일한 주소로 응답했습니다. 리졸버별 DNS 차단/스푸핑 정황 없음.", elapsedSince(started));
    }
    String breakdown = byAddresses.entrySet().stream()
        .map(entry -> String.join(",", entry.getValue()) + "=" + String.join(" ", entry.getKey()))
        .collect(Collectors.joining(" / "));
    return new Step("dns-compare", false,
        "DNS 리졸버별 응답 주소가 다릅니다: " + breakdown + ". CDN/GeoDNS의 정상적인 리전별 분산일 수도 있으나, 특정 통신사·퍼블릭 DNS에서만 다른 주소(특히 사설 IP나 차단 안내 페이지 IP)로 응답한다면 해당 리졸버의 DNS 차단·스푸핑 가능성이 있습니다.",
        elapsedSince(started));
  }

  private List<String> resolveAndValidate(URI uri) throws Exception {
    List<String> result = new ArrayList<>();
    for (InetAddress address : InetAddress.getAllByName(uri.getHost())) {
      if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress()) throw new SecurityException("private or local address");
      result.add(address.getHostAddress());
    }
    if (result.isEmpty()) throw new IOException("no address resolved");
    return result.stream().distinct().toList();
  }

  private String verdict(Target target, List<Integer> ports, List<HttpProbe> direct, List<HttpProbe> proxied, boolean hasProxy, boolean sanityOk, boolean tunnel,
      List<Boolean> tcpOk, List<TlsCheck> tls) {
    String base = baseVerdict(target, ports, direct, proxied, hasProxy, sanityOk, tunnel, tcpOk, tls);
    String certNote = certNote(tls);
    return certNote.isBlank() ? base : base + " " + certNote;
  }

  private String baseVerdict(Target target, List<Integer> ports, List<HttpProbe> direct, List<HttpProbe> proxied, boolean hasProxy, boolean sanityOk, boolean tunnel,
      List<Boolean> tcpOk, List<TlsCheck> tls) {
    boolean directAny = direct.stream().anyMatch(probe -> probe.status() != 0);
    if (directAny && direct.stream().anyMatch(probe -> probe.status() >= 400)) {
      String aws = target.host().endsWith(".elb.amazonaws.com") && direct.stream().anyMatch(probe -> probe.status() == 502)
          ? " AWS ALB/ELB라면 502는 대상 그룹에 healthy target이 없거나 백엔드 앱이 중단된 경우일 수 있으므로 대상 그룹 health와 앱 리스닝 상태를 확인하십시오." : "";
      return "프록시 없이 대상 서버 또는 중간 게이트웨이에서 HTTP 오류 응답을 받았습니다: " + codes(ports, direct) + ". 클라이언트에서 대상까지 네트워크 경로는 동작합니다. 502/503/504라면 대상 서버 또는 중간 게이트웨이의 업스트림 문제 가능성이 큽니다." + aws;
    }
    if (directAny) return "직접 연결은 정상입니다. 프록시 없이 응답한 HTTP 상태: " + codes(ports, direct) + ". 클라이언트 경로 장애가 확인되지 않았습니다.";
    if (!hasProxy && tcpOk.contains(true)) return tcpOkHttpFailVerdict(ports, tcpOk, tls);
    if (!hasProxy) return "DNS는 성공했지만 직접 TCP/HTTP는 실패했고 프록시도 발견되지 않았습니다. 아웃바운드 방화벽/이그레스 정책 차단 가능성이 큽니다. 네트워크·보안팀에 호스트와 포트(" + portsText(ports) + ")의 이그레스 규칙을 확인하십시오.";
    int code443 = codeFor(ports, proxied, 443);
    int code80 = codeFor(ports, proxied, 80);
    if (tunnel && code443 == 0 && code80 != 0 && sanityOk)
      return "프록시는 살아 있고 일반 HTTPS도 성공했으며 대상의 443은 CONNECT 터널까지 수립됐지만 TLS 데이터 응답이 없습니다. 같은 대상의 80은 HTTP " + code80 + "을 반환했습니다. 프록시는 정상이고 이 특정 호스트의 HTTPS 응답에 문제가 있습니다. 목적지별 WAF/보안 장비 차단·드롭 또는 해당 서비스의 443/백엔드 설정을 확인하십시오.";
    boolean targetResponse = proxied.stream().anyMatch(probe -> probe.status() != 0);
    if (targetResponse) {
      String aws = target.host().endsWith(".elb.amazonaws.com") ? " AWS ALB/ELB라면 502는 대상 그룹에 healthy target이 없거나 백엔드 앱이 중단된 경우일 수 있으므로 대상 그룹 health와 앱 리스닝 상태를 확인하십시오." : "";
      return "프록시를 통해 대상/중간 게이트웨이에서 응답을 받았습니다: " + codes(ports, proxied) + ". 클라이언트에서 프록시까지 경로는 동작합니다. 502/503/504라면 대상 서버 또는 중간 게이트웨이의 업스트림 문제 가능성이 큽니다." + aws;
    }
    if (sanityOk) return "프록시와 일반 HTTPS는 동작하지만 대상 프록시 요청은 응답하지 않습니다. 대상별 보안 정책/WAF 차단 또는 대상 업스트림 장애 가능성이 있습니다.";
    if (tunnel) return "프록시가 CONNECT 터널을 만들었지만 대상 데이터와 일반 인터넷 점검 응답이 없습니다. 프록시 주소/포트의 접근성과 업스트림 연결을 확인하십시오.";
    return "직접 요청이 실패했고 프록시 경유 및 일반 인터넷 점검도 응답하지 않았습니다. 프록시 주소/포트 오류 또는 프록시 접근 불가/차단 가능성이 큽니다.";
  }

  /** TCP connected but every direct HTTP probe failed: the network path is fine, the problem is TLS/HTTP-layer. */
  private String tcpOkHttpFailVerdict(List<Integer> ports, List<Boolean> tcpOk, List<TlsCheck> tls) {
    List<String> open = new ArrayList<>();
    for (int i = 0; i < ports.size(); i++) if (tcpOk.get(i)) open.add(String.valueOf(ports.get(i)));
    String tlsState = tls.stream().anyMatch(TlsCheck::handshakeOk) ? "TLS 핸드셰이크는 성공했습니다. "
        : tls.isEmpty() ? "" : "TLS 핸드셰이크도 실패했습니다. ";
    return "TCP 연결은 성공(포트 " + String.join(" ", open) + ")했으므로 클라이언트 경로와 방화벽/이그레스 차단은 아닐 가능성이 큽니다. "
        + "그러나 직접 HTTP/HTTPS 요청은 모두 실패했습니다. " + tlsState
        + "가능한 원인: (1) TLS 핸드셰이크/프로토콜 불일치, (2) 대상 측 WAF 또는 봇 보호가 연결이나 HTTP/2 스트림을 재설정, (3) 애플리케이션 계층 차단. "
        + "tls-<port> 단계는 성공하고 direct-http-<port> 단계만 실패했다면 (2)일 가능성이 큽니다.";
  }

  private String certNote(List<TlsCheck> tls) {
    List<String> notes = new ArrayList<>();
    for (TlsCheck check : tls) {
      if (!check.handshakeOk() && check.attempted()) notes.add("tls-" + check.port() + " 핸드셰이크 실패");
      else if (check.certWarning()) notes.add("tls-" + check.port() + " " + check.certSummary());
    }
    return notes.isEmpty() ? "" : "TLS 점검 메모: " + String.join("; ", notes) + ".";
  }

  private String verdictDns(String host) { return "DNS 자체가 안 됩니다. " + host + "의 주소 조회가 실패했습니다. 잘못된 호스트명 또는 현재 DNS resolver 문제 가능성이 큽니다."; }
  private boolean checkConnectTunnel(ProxySpec proxy, String targetHost, int timeoutMs) {
    try (Socket socket = new Socket()) {
      socket.connect(new InetSocketAddress(proxy.host(), proxy.port()), timeoutMs);
      socket.setSoTimeout(timeoutMs);
      OutputStream output = socket.getOutputStream();
      output.write(("CONNECT " + targetHost + ":443 HTTP/1.1\r\nHost: " + targetHost + ":443\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
      output.flush();
      String status = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII)).readLine();
      return status != null && status.matches("HTTP/\\d(?:\\.\\d)? 200(?: .*)?");
    } catch (Exception ignored) { return false; }
  }
  private String codes(List<Integer> ports, List<HttpProbe> probes) {
    List<String> values = new ArrayList<>();
    for (int i = 0; i < ports.size(); i++) if (probes.get(i).status() != 0) values.add(ports.get(i) + "=" + probes.get(i).status());
    return String.join(" ", values);
  }
  private int codeFor(List<Integer> ports, List<HttpProbe> probes, int port) { int i = ports.indexOf(port); return i < 0 ? 0 : probes.get(i).status(); }
  private String portsText(List<Integer> ports) { return String.join(" ", ports.stream().map(String::valueOf).toList()); }
  private String matchingLines(String body) {
    StringBuilder result = new StringBuilder();
    for (String line : body.split("\\R")) if (ERROR_LINES.matcher(line).matches() && result.length() < 600) result.append(result.isEmpty() ? "" : "\n").append(line.length() > 600 ? line.substring(0, 600) : line);
    return result.toString();
  }
  private String shortError(Exception exception) { String message = exception.getMessage(); String value = exception.getClass().getSimpleName() + (message == null ? "" : ": " + message); return value.length() > 180 ? value.substring(0, 180) : value; }
  private ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }

  private Target parseTarget(String value) {
    try {
      boolean explicitScheme = value.contains("://");
      URI input = URI.create(explicitScheme ? value : "https://" + value);
      String host = input.getHost();
      if (host == null || input.getUserInfo() != null || (input.getScheme() != null && !List.of("http", "https").contains(input.getScheme().toLowerCase(Locale.ROOT)))) throw new IllegalArgumentException();
      int port = input.getPort();
      return new Target(host, port, input.getScheme().toLowerCase(Locale.ROOT), explicitScheme);
    } catch (RuntimeException exception) { throw badRequest("target는 hostname 또는 http(s) URL이어야 합니다."); }
  }
  private List<Integer> parsePorts(String value, int targetPort) {
    if (targetPort > 0) return List.of(targetPort);
    String input = value == null || value.isBlank() ? "80,443" : value.trim();
    try {
      List<Integer> ports = new ArrayList<>();
      for (String part : input.split(",", -1)) { int port = Integer.parseInt(part.trim()); if (port < 1 || port > 65535) throw new NumberFormatException(); ports.add(port); }
      if (ports.isEmpty()) throw new NumberFormatException();
      return ports.stream().distinct().toList();
    } catch (NumberFormatException exception) { throw badRequest("ports는 1~65535 범위의 쉼표 구분 숫자여야 합니다."); }
  }
  private ProxySpec parseProxy(String value) {
    try {
      URI uri = URI.create(value.contains("://") ? value : "http://" + value);
      if (!"http".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getPort() < 1 || uri.getPort() > 65535 || uri.getUserInfo() != null) throw new IllegalArgumentException();
      return new ProxySpec(uri.getHost(), uri.getPort());
    } catch (RuntimeException exception) { throw badRequest("proxy는 공개 host:port 형식이어야 합니다."); }
  }
  private void validateProxy(ProxySpec proxy) {
    try { resolveAndValidate(URI.create("http://" + proxy.host() + ":" + proxy.port())); }
    catch (SecurityException exception) { throw badRequest("프록시가 사설·로컬 주소로 해석되어 차단했습니다."); }
    catch (Exception exception) { throw badRequest("프록시 호스트를 조회할 수 없습니다."); }
  }

  record Request(String target, String ports, Integer timeoutMs, String proxy) {}
  record Step(String id, boolean success, String detail, long elapsedMs) {}
  record Response(List<Step> steps, String verdict, Boolean http2Supported, boolean http3Possible, String http3Detail) {}
  record RunSummary(UUID id, String target, String ports, String verdictSnippet, Instant createdAt) {}
  record RunDetail(UUID id, String target, String ports, String proxy, int timeoutMs, List<Step> steps, String verdict, Instant createdAt) {}
  private record ProxySpec(String host, int port) {}
  private record HttpProbe(int status, String detail, String altSvc) {}
  private record DnsResolverSpec(String name, String ip) {}
  private record ResolverOutcome(DnsResolverSpec spec, boolean success, List<String> addresses, String detail, long elapsedMs) {}
  /** attempted=false means TCP failed so no handshake was tried; success is handshakeOk && !certWarning. */
  private record TlsCheck(int port, boolean attempted, boolean handshakeOk, boolean success, boolean certWarning, String detail, String certSummary, String applicationProtocol) {
    static TlsCheck skipped(int port) { return new TlsCheck(port, false, false, false, false, "TCP 연결 실패로 TLS 점검 생략", "", ""); }
  }
  private record Target(String host, int port, String scheme, boolean explicitScheme) {
    URI uri() { return requestUri(port > 0 ? port : scheme.equals("https") ? 443 : 80); }
    /** The user's explicit scheme applies only to the single explicit port; otherwise 443 is https and everything else http. */
    boolean isHttps(int selectedPort) {
      if (explicitScheme && port > 0 && selectedPort == port) return scheme.equals("https");
      return selectedPort == 443;
    }
    URI requestUri(int selectedPort) { return URI.create((isHttps(selectedPort) ? "https" : "http") + "://" + (host.contains(":") ? "[" + host + "]" : host) + ":" + selectedPort + "/"); }
  }
  private static final class DirectProxySelector extends ProxySelector {
    public List<java.net.Proxy> select(URI uri) { return List.of(java.net.Proxy.NO_PROXY); }
    public void connectFailed(URI uri, java.net.SocketAddress address, IOException failure) {}
  }
  private static final class BoundedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
    private final CompletableFuture<byte[]> body = new CompletableFuture<>();
    private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    private Flow.Subscription subscription;
    private int size;
    public CompletionStage<byte[]> getBody() { return body; }
    public void onSubscribe(Flow.Subscription value) { subscription = value; subscription.request(1); }
    public void onNext(List<ByteBuffer> chunks) {
      for (ByteBuffer chunk : chunks) {
        int length = chunk.remaining();
        if (length > MAX_RESPONSE_BYTES - size) { subscription.cancel(); body.completeExceptionally(new IOException("response exceeds 64KB limit")); return; }
        size += length; byte[] data = new byte[length]; chunk.get(data); bytes.write(data, 0, length);
      }
      subscription.request(1);
    }
    public void onError(Throwable error) { body.completeExceptionally(error); }
    public void onComplete() { body.complete(bytes.toByteArray()); }
  }
}
