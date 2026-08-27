package com.orchestration.sources;

import com.orchestration.tasks.LlmGateway;
import java.net.URI;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Periodically asks Gemini (with Google Search grounding, via the same {@code collectWithGemini} the
 * regular collection pipeline uses) to propose new security/economy sources similar in caliber to what's
 * already registered. Candidates are never auto-registered as crawl targets — a naive "find sources on
 * your own" prompt tends to surface SEO spam or off-topic blogs, so proposals land in a pending queue
 * with a one-line justification and only become a real {@link ResearchSource} once the owner approves one
 * from the UI, mirroring the propose/review pattern already used for the archive's PM quality gate.
 */
@Service
public class SourceDiscoveryService {
  private static final Logger log = LoggerFactory.getLogger(SourceDiscoveryService.class);
  private static final Pattern CANDIDATE_LINE = Pattern.compile("^\\s*[-*]?\\s*(.+?)\\s*\\|\\s*(https?://\\S+?)\\s*\\|\\s*(.+?)\\s*$");
  private static final int MAX_CANDIDATES_PER_DOMAIN = 3;
  /** Left unreviewed long enough, a candidate is auto-rejected rather than nagging forever — the owner
   * can still register it manually later if they change their mind. */
  private static final int CANDIDATE_EXPIRY_DAYS = 30;

  private final ResearchSourceRepository registeredSources;
  private final SourceCandidateRepository candidates;
  private final ResearchSourceService researchSourceService;
  private final LlmGateway llm;

  SourceDiscoveryService(ResearchSourceRepository registeredSources, SourceCandidateRepository candidates, ResearchSourceService researchSourceService, LlmGateway llm) {
    this.registeredSources = registeredSources;
    this.candidates = candidates;
    this.researchSourceService = researchSourceService;
    this.llm = llm;
  }

  @Scheduled(fixedDelayString = "${app.sources.discovery-delay-ms:604800000}")
  public void discoverScheduled() {
    expireStaleCandidates();
    for (ResearchDomain domain : ResearchDomain.values()) discover(domain);
  }

  // Explicit saveAll rather than @Transactional dirty-checking: this is called as a plain self-invocation
  // from discoverScheduled() in the same class, which bypasses Spring's proxy-based @Transactional entirely
  // (confirmed live — the log line reported a count, but the row stayed PENDING until this fix landed).
  void expireStaleCandidates() {
    Instant cutoff = Instant.now().minus(CANDIDATE_EXPIRY_DAYS, ChronoUnit.DAYS);
    List<SourceCandidate> stale = candidates.findByStatusAndDiscoveredAtBefore(CandidateStatus.PENDING, cutoff);
    stale.forEach(SourceCandidate::reject);
    if (!stale.isEmpty()) { candidates.saveAll(stale); log.info("source_candidates_expired count={}", stale.size()); }
  }

  public int discoverNow(ResearchDomain domain) { return discover(domain); }

  private static final int DEFAULT_INTERVAL_HOURS = 24;
  private static final int DEFAULT_CRAWL_DEPTH = 1;
  private static final int DEFAULT_MAX_PAGES = 20;

  @Transactional
  public ResearchSource approve(UUID id) {
    SourceCandidate candidate = candidates.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    if (candidate.getStatus() != CandidateStatus.PENDING) throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 처리된 후보입니다.");
    ResearchSource created = researchSourceService.create(new ResearchSourceService.CreateResearchSource(
        candidate.getName(), candidate.getUrl(), candidate.getDomain(), DEFAULT_INTERVAL_HOURS, DEFAULT_CRAWL_DEPTH, DEFAULT_MAX_PAGES,
        "AI가 발견해 제안한 출처 (owner 승인됨): " + candidate.getJustification()));
    candidate.approve();
    return created;
  }

  @Transactional
  public void reject(UUID id) {
    SourceCandidate candidate = candidates.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    if (candidate.getStatus() != CandidateStatus.PENDING) throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 처리된 후보입니다.");
    candidate.reject();
  }

  /** Synchronized because this is a single-instance app: the scheduled sweep fires immediately on every
   * container start, and a manual discover-now call landing in that same window would otherwise race it —
   * both reading the dedup set before either had saved, producing duplicate candidates (seen once with
   * BleepingComputer proposed twice, with/without a trailing slash, during startup testing). */
  private synchronized int discover(ResearchDomain domain) {
    List<ResearchSource> all = registeredSources.findAllByOrderByDomainAscCreatedAtDesc();
    List<ResearchSource> seeds = all.stream().filter(source -> source.getDomain() == domain).toList();
    String seedList = seeds.isEmpty() ? "(등록된 출처 없음)"
        : seeds.stream().map(source -> source.getName() + " (" + source.getUrl() + ")").collect(Collectors.joining(", "));
    Set<String> knownUrls = new HashSet<>();
    all.forEach(source -> knownUrls.add(normalize(source.getUrl())));
    candidates.findAll().forEach(candidate -> knownUrls.add(normalize(candidate.getUrl())));
    try {
      LlmGateway.LlmResult result = llm.collectWithGemini("""
          당신은 %s 분야 뉴스·분석 출처를 심사하는 깐깐한 리서치 책임자입니다. 후하게 점수를 주지 말고, 최고 수준만 통과시키세요.
          현재 등록된 출처: %s
          위 출처들과 동등하거나 더 나은 신뢰도·전문성을 가진, 아직 등록되지 않은 새로운 출처를 최대 %d개까지만 제안하세요 — 채우기 위해 억지로 개수를 맞추지 마세요.
          블로그 스팸, SEO 콘텐츠 농장, 출처가 불분명한 사이트, 홍보성 기업 블로그, 최근 활동이 뜸하거나 품질이 예전만 못한 매체는 모두 제외하세요.
          다음 기준으로 비판적으로 검토하세요: 실제로 업계에서 자주 인용되는가, 원 출처 취재인지 재탕 콘텐츠인지, 편집 기준과 정정 이력이 있는지, 특정 벤더·업계 이해관계에 치우치지 않는지.
          조금이라도 애매하면 제외하고, 확신이 없으면 그 줄은 아예 쓰지 마세요. 적합한 후보가 없으면 아무 줄도 답하지 마세요.
          각 후보를 정확히 이 형식의 한 줄로만 답하세요 (다른 설명·번호·마크다운 없이). 근거에는 강점뿐 아니라 한계·주의할 점도 한 가지 이상 포함하세요:
          이름 | https://직접URL | 강점과 한계를 함께 담은 한 줄 근거 (예: "~이 강점이나 ~은 주의가 필요")
          """.formatted(domainLabel(domain), seedList, MAX_CANDIDATES_PER_DOMAIN));
      int saved = 0;
      for (String line : result.content().lines().toList()) {
        Matcher matcher = CANDIDATE_LINE.matcher(line);
        if (!matcher.matches()) continue;
        String name = matcher.group(1).trim();
        String url = matcher.group(2).trim();
        String justification = matcher.group(3).trim();
        if (name.isBlank() || !isValidUrl(url) || knownUrls.contains(normalize(url)) || looksTruncated(justification)) continue;
        candidates.save(new SourceCandidate(name, url, domain, justification));
        knownUrls.add(normalize(url));
        saved++;
      }
      log.info("source_discovery_completed domain={} proposed={}", domain, saved);
      return saved;
    } catch (Exception exception) {
      log.warn("source_discovery_failed domain={}", domain, exception);
      return 0;
    }
  }

  private boolean isValidUrl(String value) {
    try {
      URI uri = URI.create(value);
      return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) && uri.getHost() != null;
    } catch (IllegalArgumentException exception) {
      return false;
    }
  }

  private String normalize(String url) { return url.toLowerCase(Locale.ROOT).replaceFirst("^https?://(www\\.)?", "").replaceFirst("/+$", ""); }

  /**
   * Gemini 2.5는 내부 "thinking" 토큰이 maxOutputTokens 예산을 함께 소비하는데, 예산이 빠듯하면 후보
   * 목록 중 마지막 줄이 한 글자짜리 조각("...위")에서 그대로 끊긴다. CANDIDATE_LINE 정규식은 문장이
   * 완성됐는지 검사하지 않아 이런 조각도 그대로 통과하므로, 근거가 문장부호 없이 애매하게 끝나거나
   * 너무 짧으면(원래 프롬프트가 강점+한계 두 절을 요구하므로 정상적인 답은 항상 이보다 길다) 저장하지
   * 않는다 — 잘린 후보 하나를 보여주는 것보다 그 사이클에 후보가 하나 적은 편이 낫다.
   */
  /** Package-visible so it can be unit-tested directly against real truncated examples without needing to
   * mock the whole Gemini call chain. */
  boolean looksTruncated(String justification) {
    if (justification.length() < 20) return true;
    return !justification.matches(".*[.!?다요임함음됨\\)」”\"']\\s*$");
  }
  private String domainLabel(ResearchDomain domain) { return domain == ResearchDomain.SECURITY ? "보안" : "경제"; }
}
