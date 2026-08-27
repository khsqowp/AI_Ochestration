package com.orchestration.sources;

import com.orchestration.calendar.SecurityCalendarService;
import com.orchestration.files.FileProperties;
import com.orchestration.tasks.LlmGateway;
import com.orchestration.tasks.TaskDomain;
import com.orchestration.tasks.TaskOrigin;
import com.orchestration.tasks.TaskService;
import com.orchestration.tasks.TaskWorkflowRunner;
import com.orchestration.tasks.WorkTask;
import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Collects public registered URLs with bounded same-domain link discovery.
 *
 * <p>Well-behaved crawling — following redirects, honoring robots.txt Disallow rules, and pacing
 * requests to a site's declared Crawl-Delay — is what actually keeps a site's own bot-protection from
 * blocking us mid-crawl. This deliberately does not attempt to spoof a browser UA or otherwise evade a
 * site's anti-bot decisions; a site that disallows our agent is skipped, not worked around.
 */
@Service
public class SourceCollectionService {
  private static final Logger log = LoggerFactory.getLogger(SourceCollectionService.class);
  private static final String USER_AGENT = "OrchestrationLabResearchCollector/0.2 (personal research)";
  private static final int MAX_RESPONSE_BYTES = 2_000_000;
  private static final long MIN_DELAY_MS = 500;
  private static final long MAX_DELAY_MS = 5000; // a strict declared crawl-delay (Krebs asks for 35s) would make "즉시 수집" exceed the proxy timeout, so this caps politeness at something still usable
  private static final Pattern HREF = Pattern.compile("(?i)<a\\s+[^>]*?href\\s*=\\s*[\"']([^\"'#][^\"']*)[\"']");
  // Attempt 1 retries after 2h, attempt 2 after 6h, attempt 3 after 24h; beyond that it just waits for
  // the source's normal intervalHours cycle rather than retrying forever.
  private static final long[] RETRY_BACKOFF_HOURS = {2, 6, 24};
  private final ResearchSourceService sources;
  private final FileProperties files;
  private final TaskService tasks;
  private final SecurityCalendarService calendar;
  private final LlmGateway llm;
  private final GeminiCollectionBatchRepository batches;
  private final PageSnapshotRepository snapshots;
  private final TaskWorkflowRunner runner;
  private final Executor collectionExecutor;
  private final CollectionSettingService collectionSettings;
  private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NORMAL).build();

  SourceCollectionService(ResearchSourceService sources, FileProperties files, TaskService tasks, SecurityCalendarService calendar,
      LlmGateway llm, GeminiCollectionBatchRepository batches, PageSnapshotRepository snapshots, TaskWorkflowRunner runner,
      @Qualifier("sourceCollectionExecutor") Executor collectionExecutor, CollectionSettingService collectionSettings) {
    this.sources = sources; this.files = files; this.tasks = tasks; this.calendar = calendar;
    this.llm = llm; this.batches = batches; this.snapshots = snapshots; this.runner = runner; this.collectionExecutor = collectionExecutor;
    this.collectionSettings = collectionSettings;
  }

  /** Nightly routine collection: submitted to Gemini's Batch API (50% cost) rather than run in real
   * time, since nobody is waiting on this interactively — {@link #collectNow} (manual button) and
   * {@link #retryFailedSources} (failure-retry sweep) stay real-time on purpose. */
  @Scheduled(cron = "${app.sources.daily-cron:0 0 0 * * *}")
  public void collectDueSources() {
    if (!collectionSettings.enabled()) { log.info("source_collection_skipped reason=disabled_by_owner"); return; }
    submitBatchForSources(sources.due());
  }

  /** A cycle that saved zero pages doesn't wait for the next full intervalHours window — this sweep
   * re-attempts it on the backoff schedule computed in {@link #collect}, much sooner than tomorrow's run. */
  @Scheduled(fixedDelayString = "${app.sources.retry-check-delay-ms:1800000}")
  public void retryFailedSources() {
    if (!collectionSettings.enabled()) return;
    collectAllConcurrently(sources.dueForRetry());
  }

  private void collectAllConcurrently(List<ResearchSource> targets) {
    List<CompletableFuture<Void>> futures = targets.stream()
        .map(source -> CompletableFuture.runAsync(() -> collect(source, false), collectionExecutor))
        .toList();
    CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
  }

  public CollectionResult collectNow(UUID id) { return collect(sources.get(id), true); }

  private CollectionResult collect(ResearchSource source, boolean manual) {
    CrawlOutcome outcome = crawl(source, manual);
    String excerpt = outcome.changed() > 0 ? excerptFrom(outcome.changedPaths()) : "";
    WorkTask analysisTask = outcome.changed() > 0 ? tasks.create(
        "[%s] %s 파일 아카이브".formatted(source.getDomain() == ResearchDomain.SECURITY ? "보안" : "경제", source.getName()),
        buildInstruction(source, outcome.changed(), excerpt),
        source.getDomain() == ResearchDomain.SECURITY ? TaskDomain.SECURITY : TaskDomain.ECONOMY, TaskOrigin.COLLECTION, source.getId()) : null;
    if (outcome.changed() > 0 && source.getDomain() == ResearchDomain.SECURITY) calendar.extractFromCollection(source, excerpt);
    return new CollectionResult(outcome.saved(), outcome.changed(), outcome.failed(), outcome.visited(), source.getCrawlDepth(), source.getMaxPages(), outcome.warning(), analysisTask == null ? null : analysisTask.getId());
  }

  /** Crawls a source and saves its pages to disk — shared by the real-time path ({@link #collect}) and
   * the nightly batch path ({@link #crawlAndEnqueue}); only what happens to the resulting WorkTask differs
   * between the two. */
  private CrawlOutcome crawl(ResearchSource source, boolean manual) {
    ArrayDeque<CrawlTarget> pending = new ArrayDeque<>();
    Set<String> visited = new HashSet<>();
    List<Path> savedPaths = new ArrayList<>();
    List<Path> changedPaths = new ArrayList<>();
    pending.add(new CrawlTarget(normalize(URI.create(source.getUrl())), 0));
    int saved = 0; int failed = 0; int changed = 0; int skippedByRobots = 0;
    String warning = null;
    try {
      URI root = URI.create(source.getUrl());
      String allowedHost = root.getHost().toLowerCase(Locale.ROOT);
      List<String> allowedPathPrefix = pathSegments(root.getPath());
      RobotsRules robots = fetchRobotsRules(root);
      long delayMs = Math.min(Math.max(robots.crawlDelayMs(), MIN_DELAY_MS), MAX_DELAY_MS);
      boolean firstFetch = true;
      while (!pending.isEmpty() && visited.size() < source.getMaxPages()) {
        CrawlTarget target = pending.removeFirst();
        if (!visited.add(target.uri().toString())) continue;
        if (robots.disallows(target.uri())) { skippedByRobots++; continue; }
        try {
          rejectPrivateTarget(target.uri());
          if (!firstFetch) Thread.sleep(delayMs);
          firstFetch = false;
          HttpResponse<byte[]> response = fetch(target.uri());
          if (response.statusCode() < 200 || response.statusCode() >= 300) throw new IOException("HTTP " + response.statusCode());
          if (response.body().length > MAX_RESPONSE_BYTES) throw new IOException("response exceeds 2MB limit");
          String contentType = response.headers().firstValue("content-type").orElse("");
          Path destination = destinationFor(source, target.uri(), contentType);
          Files.createDirectories(destination.getParent());
          Files.write(destination, response.body());
          savedPaths.add(destination);
          saved++;
          if (contentChanged(target.uri().toString(), response.body())) { changedPaths.add(destination); changed++; }
          if (target.depth() < source.getCrawlDepth() && isHtml(contentType)) {
            for (URI link : links(target.uri(), response.body())) {
              if (sameHost(allowedHost, link) && withinRootPath(allowedPathPrefix, link) && !visited.contains(link.toString()) && pending.size() + visited.size() < source.getMaxPages()) pending.addLast(new CrawlTarget(link, target.depth() + 1));
            }
          }
        } catch (Exception exception) {
          failed++;
          log.warn("research_source_page_failed sourceId={} url={}", source.getId(), target.uri(), exception);
        }
      }
      log.info("research_source_collected sourceId={} saved={} failed={} skippedByRobots={} delayMs={} manual={}", source.getId(), saved, failed, skippedByRobots, delayMs, manual);
    } catch (Exception exception) {
      warning = "수집 준비 실패: " + exception.getMessage();
      log.warn("research_source_collection_failed sourceId={} url={}", source.getId(), source.getUrl(), exception);
    }
    // last_collected_at은 실제로 뭔가 저장됐을 때만 갱신한다 -- 무조건 갱신하면 재시도(성공이든 실패든)가
    // due()의 24시간 창을 계속 밀어버려서, 계속 실패하는 소스가 야간 배치 대상에서 영영 빠지게 된다.
    if (saved > 0) { sources.markCollected(source.getId()); sources.clearRetryState(source.getId()); }
    else sources.recordCollectionFailure(source.getId(), RETRY_BACKOFF_HOURS);
    return new CrawlOutcome(saved, failed, changed, visited.size(), warning, savedPaths, changedPaths);
  }

  private record PendingBatchItem(WorkTask task, String prompt) {}

  /** Crawls a source and, if pages were saved, registers its analysis task in AWAITING_BATCH state
   * instead of running it immediately — the task resumes once {@link #pollGeminiBatches} sees this
   * batch job succeed. Returns null when nothing was saved, since there is nothing to submit. */
  private PendingBatchItem crawlAndEnqueue(ResearchSource source) {
    CrawlOutcome outcome = crawl(source, false);
    if (outcome.changed() == 0) return null;
    String excerpt = excerptFrom(outcome.changedPaths());
    TaskDomain domain = source.getDomain() == ResearchDomain.SECURITY ? TaskDomain.SECURITY : TaskDomain.ECONOMY;
    String instruction = buildInstruction(source, outcome.changed(), excerpt);
    WorkTask task = tasks.createAwaitingBatch(
        "[%s] %s 파일 아카이브".formatted(source.getDomain() == ResearchDomain.SECURITY ? "보안" : "경제", source.getName()),
        instruction, domain, TaskOrigin.COLLECTION, source.getId());
    if (source.getDomain() == ResearchDomain.SECURITY) calendar.extractFromCollection(source, excerpt);
    return new PendingBatchItem(task, llm.collectPrompt(domain, instruction));
  }

  private void submitBatchForSources(List<ResearchSource> targets) {
    if (targets.isEmpty()) return;
    List<CompletableFuture<PendingBatchItem>> futures = targets.stream()
        .map(source -> CompletableFuture.supplyAsync(() -> crawlAndEnqueue(source), collectionExecutor))
        .toList();
    CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
    Map<String, String> promptsByKey = new LinkedHashMap<>();
    for (CompletableFuture<PendingBatchItem> future : futures) {
      PendingBatchItem item = future.join();
      if (item != null) promptsByKey.put(item.task().getId().toString(), item.prompt());
    }
    if (promptsByKey.isEmpty()) return;
    try {
      LlmGateway.BatchSubmission submission = llm.submitCollectBatch(promptsByKey);
      batches.save(new GeminiCollectionBatch(submission.jobName()));
      for (String taskId : promptsByKey.keySet()) tasks.attachBatchJob(UUID.fromString(taskId), submission.jobName());
      log.info("gemini_collection_batch_submitted jobName={} tasks={}", submission.jobName(), promptsByKey.size());
    } catch (Exception exception) {
      log.warn("gemini_collection_batch_submit_failed taskCount={}", promptsByKey.size(), exception);
      failAwaitingTasks(promptsByKey.keySet(), "야간 배치 제출 실패: " + exception.getMessage());
    }
  }

  /** Polls every not-yet-processed batch job and, once Gemini reports a terminal state, distributes its
   * results — this runs frequently (default every 30 minutes) rather than waiting for a fixed clock time,
   * since batch jobs typically finish well under Gemini's 24h target turnaround. */
  @Scheduled(fixedDelayString = "${app.sources.batch-poll-delay-ms:1800000}")
  public void pollGeminiBatches() {
    for (GeminiCollectionBatch batch : batches.findByProcessedFalse()) {
      try {
        LlmGateway.BatchPoll poll = llm.pollCollectBatch(batch.getProviderBatchName());
        if (List.of("BATCH_STATE_SUCCEEDED", "BATCH_STATE_FAILED", "BATCH_STATE_EXPIRED", "BATCH_STATE_CANCELLED").contains(poll.state())) {
          distributeResults(batch, poll);
        }
      } catch (Exception exception) {
        log.warn("gemini_collection_batch_poll_failed jobName={}", batch.getProviderBatchName(), exception);
      }
    }
  }

  private void distributeResults(GeminiCollectionBatch batch, LlmGateway.BatchPoll poll) {
    for (WorkTask task : tasks.findAwaitingBatch(batch.getProviderBatchName())) {
      String key = task.getId().toString();
      LlmGateway.LlmResult result = poll.results().get(key);
      if (result != null) runner.resumeFromBatchCollection(task.getId(), result);
      else tasks.failCollection(task.getId(), poll.errors().getOrDefault(key, "배치 작업이 결과 없이 종료되었습니다: " + poll.state()));
    }
    batch.markProcessed();
    batches.save(batch);
    log.info("gemini_collection_batch_processed jobName={} state={}", batch.getProviderBatchName(), poll.state());
  }

  private void failAwaitingTasks(Set<String> taskIds, String reason) {
    for (String taskId : taskIds) tasks.failCollection(UUID.fromString(taskId), reason);
  }

  private static final int EXCERPT_BUDGET_CHARS = 6000;
  private static final int EXCERPT_PER_PAGE_CHARS = 1200;

  /**
   * Gemini's only tool here is google_search — it has no filesystem access, so an earlier version of this
   * instruction telling it to "check the originals/web folder" was unfulfillable. It silently fell back to
   * a fresh live search instead of the pages this crawl just saved. Embed the actual saved text directly.
   */
  private String buildInstruction(ResearchSource source, int saved, String excerpt) {
    return ("등록 수집 사이트 '%s'(%s)에서 방금 %d개 페이지를 수집했습니다. 아래는 방금 저장된 원문에서 추출한 발췌이며, 이것을 최우선 근거로 삼아 핵심 변화·중요도를 한국어로 정리하세요. 같은 사건이나 기사가 여러 페이지에 걸쳐 반복 언급되더라도 어디서 몇 번 나왔는지 같은 중복 발견 과정은 설명하지 말고, 하나의 핵심 변화 항목으로 조용히 합쳐서 작성하세요. 발췌만으로 부족한 부분만 검색으로 보강하세요. 원문 URL은 %s 입니다.\n\n[수집 원문 발췌]\n%s")
        .formatted(source.getName(), source.getDomain(), saved, source.getUrl(), excerpt.isBlank() ? "(본문 발췌 추출 실패 — 검색으로 전량 보강 필요)" : excerpt);
  }

  private String excerptFrom(List<Path> savedPaths) {
    StringBuilder combined = new StringBuilder();
    for (Path path : savedPaths) {
      if (combined.length() >= EXCERPT_BUDGET_CHARS) break;
      try {
        String text = stripMarkup(Files.readString(path, StandardCharsets.UTF_8));
        if (text.isBlank()) continue;
        String piece = text.length() > EXCERPT_PER_PAGE_CHARS ? text.substring(0, EXCERPT_PER_PAGE_CHARS) : text;
        combined.append("### ").append(path.getFileName()).append('\n').append(piece).append("\n\n");
      } catch (IOException ignored) { /* unreadable snapshot (binary/encoding), skip it */ }
    }
    return combined.length() > EXCERPT_BUDGET_CHARS ? combined.substring(0, EXCERPT_BUDGET_CHARS) : combined.toString();
  }

  private String stripMarkup(String raw) {
    String withoutScripts = raw.replaceAll("(?is)<script.*?</script>", " ").replaceAll("(?is)<style.*?</style>", " ");
    String noTags = withoutScripts.replaceAll("(?s)<[^>]+>", " ");
    String decoded = noTags.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'");
    return decoded.replaceAll("\\s+", " ").trim();
  }

  /** Normalizes a fetched page the same way {@link #excerptFrom} does (so markup noise doesn't register
   * as a content change) and compares it against the last hash seen for this exact URL. A URL fetched for
   * the first time always counts as changed — there is nothing to compare it against yet.
   *
   * <p>Package-visible so tests can exercise it directly with a mocked {@link PageSnapshotRepository}
   * rather than going through the full HTTP crawl. */
  boolean contentChanged(String url, byte[] body) {
    String hash = sha256(stripMarkup(new String(body, StandardCharsets.UTF_8)));
    return snapshots.findByUrl(url)
        .map(snapshot -> {
          boolean changed = !snapshot.getContentHash().equals(hash);
          if (changed) snapshot.update(hash);
          return changed;
        })
        .orElseGet(() -> { snapshots.save(new PageSnapshot(url, hash)); return true; });
  }

  private String sha256(String text) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception exception) {
      throw new IllegalStateException("SHA-256 unavailable", exception);
    }
  }

  private HttpResponse<byte[]> fetch(URI uri) throws Exception {
    HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.8,*/*;q=0.1")
        .GET().build();
    HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
    // The client now follows redirects automatically (needed so a plain 301/302 isn't treated as a
    // failed fetch); re-validate wherever it actually landed so a redirect can't be used to reach a
    // private/local address that rejectPrivateTarget already cleared for the original URL.
    if (!response.uri().equals(uri)) rejectPrivateTarget(response.uri());
    return response;
  }

  private RobotsRules fetchRobotsRules(URI root) {
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(root.getScheme() + "://" + root.getHost() + "/robots.txt"))
          .timeout(Duration.ofSeconds(10)).header("User-Agent", USER_AGENT).GET().build();
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      return response.statusCode() == 200 ? parseRobots(response.body()) : RobotsRules.permissive();
    } catch (Exception exception) {
      return RobotsRules.permissive(); // missing/unreachable robots.txt is not a signal to block ourselves
    }
  }

  /**
   * Best-effort robots.txt parser: honors Disallow/Allow/Crawl-delay for whichever group applies to us
   * (nothing names this collector specifically, so the "User-agent: *" group is what applies). Not a
   * full RFC 9309 parser, but handles two things a naive line-by-line reading of the spec tends to miss:
   *
   * <p>1. A group can list several User-agents before its rules (e.g. "User-agent: *" then
   * "User-agent: Googlebot" then "Disallow: /x") — every agent named before the first rule line shares
   * those rules. Only resetting on the *next* rule line (not on every User-agent line) means a group
   * that happens to list "*" first and a named bot second isn't silently dropped.
   *
   * <p>2. "Allow" carve-outs inside a broader "Disallow" (e.g. "Disallow: /x/" + "Allow: /x/public") are
   * common (WordPress's default robots.txt does exactly this for /wp-admin/). Per RFC 9309 the longer,
   * more specific rule wins regardless of which directive it is, so this tracks Allow separately and
   * resolves conflicts by directive length rather than treating any Disallow match as final.
   */
  private RobotsRules parseRobots(String body) {
    List<RobotsDirective> disallow = new ArrayList<>();
    List<RobotsDirective> allow = new ArrayList<>();
    long crawlDelayMs = 0;
    Set<String> groupAgents = new HashSet<>();
    boolean groupHasRules = false;
    boolean applicable = false;
    for (String rawLine : body.split("\n")) {
      String line = rawLine.replaceFirst("#.*$", "").trim();
      int colon = line.indexOf(':');
      if (colon < 0) continue;
      String key = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
      String value = line.substring(colon + 1).trim();
      if (key.equals("user-agent")) {
        if (groupHasRules) { groupAgents.clear(); groupHasRules = false; } // prior group's rules ended; this starts a new one
        groupAgents.add(value.toLowerCase(Locale.ROOT));
        applicable = groupAgents.contains("*");
      } else if (key.equals("disallow") && !value.isBlank()) {
        groupHasRules = true;
        if (applicable) disallow.add(new RobotsDirective(toRobotsPattern(value), value.length()));
      } else if (key.equals("allow") && !value.isBlank()) {
        groupHasRules = true;
        if (applicable) allow.add(new RobotsDirective(toRobotsPattern(value), value.length()));
      } else if (key.equals("crawl-delay")) {
        groupHasRules = true;
        if (applicable) { try { crawlDelayMs = Math.max(crawlDelayMs, Math.round(Double.parseDouble(value) * 1000)); } catch (NumberFormatException ignored) { } }
      }
    }
    return new RobotsRules(disallow, allow, crawlDelayMs);
  }

  private Pattern toRobotsPattern(String directive) {
    boolean endAnchor = directive.endsWith("$");
    String body = endAnchor ? directive.substring(0, directive.length() - 1) : directive;
    StringBuilder regex = new StringBuilder("^");
    for (String part : body.split("\\*", -1)) { regex.append(Pattern.quote(part)); regex.append(".*"); }
    regex.setLength(regex.length() - 2); // drop the trailing ".*" the loop always appends
    if (endAnchor) regex.append("$");
    return Pattern.compile(regex.toString());
  }

  private Set<URI> links(URI base, byte[] body) {
    Set<URI> links = new HashSet<>();
    Matcher matcher = HREF.matcher(new String(body, java.nio.charset.StandardCharsets.UTF_8));
    while (matcher.find()) {
      try {
        URI resolved = normalize(base.resolve(matcher.group(1)));
        if ("http".equalsIgnoreCase(resolved.getScheme()) || "https".equalsIgnoreCase(resolved.getScheme())) links.add(resolved);
      } catch (IllegalArgumentException ignored) { }
    }
    return links;
  }

  private URI normalize(URI uri) { return URI.create(uri.toString().replaceFirst("#.*$", "")); }
  private boolean sameHost(String allowedHost, URI uri) { return uri.getHost() != null && uri.getHost().equalsIgnoreCase(allowedHost); }
  private boolean isHtml(String contentType) { return contentType.toLowerCase(Locale.ROOT).contains("html") || contentType.isBlank(); }

  /** Same-host was the only check on discovered links, so a page's shared site navigation (donate, about,
   * unrelated topic sections) got queued right alongside the source's own topic just because it shared a
   * domain — confirmed in production on both a mixed-topic blog root and a narrowly-scoped one (EFF
   * Deeplinks). Restricting depth>0 discovery to links that also stay under the source's own configured
   * path keeps the crawl on-topic. A source registered at the site root (no path) opts out of this by
   * having no segments to restrict against, since that's an intentionally whole-site source.
   *
   * <p>Package-visible so tests can exercise it directly with constructed URIs. */
  List<String> pathSegments(String path) {
    if (path == null || path.isBlank() || path.equals("/")) return List.of();
    String trimmed = path.startsWith("/") ? path.substring(1) : path;
    if (trimmed.endsWith("/")) trimmed = trimmed.substring(0, trimmed.length() - 1);
    return Arrays.asList(trimmed.split("/"));
  }

  boolean withinRootPath(List<String> rootSegments, URI link) {
    if (rootSegments.isEmpty()) return true;
    List<String> linkSegments = pathSegments(link.getPath());
    if (linkSegments.size() < rootSegments.size()) return false;
    for (int i = 0; i < rootSegments.size(); i++) if (!linkSegments.get(i).equals(rootSegments.get(i))) return false;
    return true;
  }

  private Path destinationFor(ResearchSource source, URI page, String contentType) {
    String host = page.getHost().replaceAll("[^a-zA-Z0-9.-]", "_");
    String stamp = DateTimeFormatter.ISO_INSTANT.format(Instant.now()).replace(':', '-');
    String extension = contentType.toLowerCase(Locale.ROOT).contains("xml") ? "xml" : contentType.toLowerCase(Locale.ROOT).contains("plain") ? "txt" : "html";
    return Path.of(files.originalsPath()).toAbsolutePath().normalize().resolve("web").resolve(source.getDomain().name().toLowerCase(Locale.ROOT)).resolve(host).resolve(stamp + "." + extension);
  }

  private void rejectPrivateTarget(URI uri) throws Exception {
    for (InetAddress address : InetAddress.getAllByName(uri.getHost())) {
      if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress()) throw new SecurityException("private or local address is not a valid research source");
    }
  }

  private record CrawlOutcome(int saved, int failed, int changed, int visited, String warning, List<Path> savedPaths, List<Path> changedPaths) {}
  private record CrawlTarget(URI uri, int depth) {}
  private record RobotsDirective(Pattern pattern, int length) {}
  private record RobotsRules(List<RobotsDirective> disallow, List<RobotsDirective> allow, long crawlDelayMs) {
    static RobotsRules permissive() { return new RobotsRules(List.of(), List.of(), 0); }
    /** RFC 9309 §2.2.2: the longest (most specific) matching rule wins; Allow wins ties. */
    boolean disallows(URI uri) {
      String target = uri.getRawPath() + (uri.getRawQuery() != null ? "?" + uri.getRawQuery() : "");
      int longestDisallow = longestMatch(disallow, target);
      if (longestDisallow < 0) return false;
      return longestMatch(allow, target) < longestDisallow;
    }
    private static int longestMatch(List<RobotsDirective> directives, String target) {
      int best = -1;
      for (RobotsDirective directive : directives) if (directive.pattern().matcher(target).find()) best = Math.max(best, directive.length());
      return best;
    }
  }
  public record CollectionResult(int savedPages, int changedPages, int failedPages, int visitedPages, int crawlDepth, int maxPages, String warning, java.util.UUID analysisTaskId) {}
}
