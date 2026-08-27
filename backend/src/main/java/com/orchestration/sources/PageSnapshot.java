package com.orchestration.sources;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Tracks the last-seen content hash of a crawled URL, so re-crawling a page whose article text hasn't
 * actually changed since last time skips the expensive multi-agent analysis pass instead of re-running it
 * for no new information. */
@Entity
@Table(name = "page_snapshots", indexes = @Index(name = "idx_page_snapshots_url", columnList = "url", unique = true))
public class PageSnapshot {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, unique = true, length = 1024) private String url;
  @Column(nullable = false, length = 64) private String contentHash;
  @Column(nullable = false) private Instant updatedAt = Instant.now();

  protected PageSnapshot() {}
  PageSnapshot(String url, String contentHash) { this.url = url; this.contentHash = contentHash; }

  public UUID getId() { return id; }
  public String getUrl() { return url; }
  public String getContentHash() { return contentHash; }
  public Instant getUpdatedAt() { return updatedAt; }
  void update(String contentHash) { this.contentHash = contentHash; this.updatedAt = Instant.now(); }
}
