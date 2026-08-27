package com.orchestration.sources;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** A source Gemini proposed on its own, awaiting owner approval before it ever becomes a crawl target. */
@Entity
@Table(name = "source_candidates", indexes = {
    @Index(name = "idx_source_candidates_status_discovered_at", columnList = "status, discovered_at")
})
public class SourceCandidate {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, length = 120) private String name;
  @Column(nullable = false, length = 2048) private String url;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private ResearchDomain domain;
  @Lob @Column(nullable = false, columnDefinition = "TEXT") private String justification;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private CandidateStatus status = CandidateStatus.PENDING;
  @Column(nullable = false) private Instant discoveredAt = Instant.now();
  private Instant decidedAt;

  protected SourceCandidate() {}
  SourceCandidate(String name, String url, ResearchDomain domain, String justification) {
    this.name = name; this.url = url; this.domain = domain; this.justification = justification;
  }

  public UUID getId() { return id; }
  public String getName() { return name; }
  public String getUrl() { return url; }
  public ResearchDomain getDomain() { return domain; }
  public String getJustification() { return justification; }
  public CandidateStatus getStatus() { return status; }
  public Instant getDiscoveredAt() { return discoveredAt; }
  public Instant getDecidedAt() { return decidedAt; }
  void approve() { status = CandidateStatus.APPROVED; decidedAt = Instant.now(); }
  void reject() { status = CandidateStatus.REJECTED; decidedAt = Instant.now(); }
}
