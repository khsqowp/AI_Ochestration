package com.orchestration.sources;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "research_sources", indexes = {
    @Index(name = "idx_research_sources_enabled", columnList = "enabled"),
    @Index(name = "idx_research_sources_next_retry_at", columnList = "next_retry_at")
})
public class ResearchSource {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, length = 120) private String name;
  @Column(nullable = false, unique = true, length = 2048) private String url;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private ResearchDomain domain;
  @Column(nullable = false) private int intervalHours;
  @Column(nullable = false) private int crawlDepth = 1;
  @Column(nullable = false) private int maxPages = 20;
  @Column(nullable = false) private boolean enabled = true;
  // AI가 제안한 출처를 owner가 승인하면 candidate의 justification(길이 제한 없는 LLM 문단)을 그대로
  // note에 옮겨 담는데, 500자 VARCHAR로는 자주 넘쳐서 MySQL이 문장 중간을 조용히 잘라버렸다.
  @Lob @Column(columnDefinition = "TEXT") private String note;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  private Instant lastCollectedAt;
  // A collection cycle that saves zero pages (site down, blocking us, DNS failure) would otherwise sit
  // untouched until the next full intervalHours window since markCollected() already ran — these two
  // fields let a dedicated retry sweep re-attempt it much sooner, with backoff, before giving up back to
  // the normal schedule.
  @Column(nullable = false) private int consecutiveFailures = 0;
  private Instant nextRetryAt;
  // A collection cycle can succeed technically (pages saved) yet still turn out to have no real news —
  // the team-lead LLM signals that with NO_NEW_CONTENT (see TaskWorkflowRunner) and the task completes
  // without archiving anything. This is a distinct signal from consecutiveFailures above (which tracks
  // the crawl itself failing) — a source stuck here for weeks is a candidate for disabling, not retrying.
  @Column(nullable = false) private int consecutiveNoContentCycles = 0;

  protected ResearchSource() {}
  ResearchSource(String name, String url, ResearchDomain domain, int intervalHours, int crawlDepth, int maxPages, String note) {
    this.name = name; this.url = url; this.domain = domain; this.intervalHours = intervalHours; this.crawlDepth = crawlDepth; this.maxPages = maxPages; this.note = note;
  }
  public UUID getId() { return id; }
  public String getName() { return name; }
  public String getUrl() { return url; }
  public ResearchDomain getDomain() { return domain; }
  public int getIntervalHours() { return intervalHours; }
  public int getCrawlDepth() { return crawlDepth; }
  public int getMaxPages() { return maxPages; }
  public boolean isEnabled() { return enabled; }
  public String getNote() { return note; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getLastCollectedAt() { return lastCollectedAt; }
  public int getConsecutiveFailures() { return consecutiveFailures; }
  public Instant getNextRetryAt() { return nextRetryAt; }
  public int getConsecutiveNoContentCycles() { return consecutiveNoContentCycles; }
  public void markCollected() { lastCollectedAt = Instant.now(); }
  /** A cycle that saved at least one page counts as recovered — clears the backoff so a future blip
   * starts counting from zero again instead of inheriting today's failure streak. */
  void clearRetryState() { consecutiveFailures = 0; nextRetryAt = null; }
  /** Backoff schedule indexed by attempt number (1st failure → hours[0], etc.); once the streak exceeds
   * the schedule's length, retries stop and the source just waits for its normal intervalHours cycle. */
  void recordCollectionFailure(long[] backoffHours) {
    consecutiveFailures++;
    if (consecutiveFailures <= backoffHours.length) nextRetryAt = Instant.now().plusSeconds(backoffHours[consecutiveFailures - 1] * 3600);
    else nextRetryAt = null;
  }
  void recordNoContent() { consecutiveNoContentCycles++; }
  void recordContentFound() { consecutiveNoContentCycles = 0; }
  void update(String name, ResearchDomain domain, int intervalHours, int crawlDepth, int maxPages, String note) {
    this.name = name; this.domain = domain; this.intervalHours = intervalHours; this.crawlDepth = crawlDepth; this.maxPages = maxPages; this.note = note;
  }
  boolean applyLegacyCrawlDefaults() {
    if (maxPages >= 1) return false;
    crawlDepth = 1;
    maxPages = 20;
    return true;
  }
}
