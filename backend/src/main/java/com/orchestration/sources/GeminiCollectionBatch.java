package com.orchestration.sources;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** One Gemini Batch API job submitted for nightly source collection — tracks whether its results have
 * already been distributed to the WorkTasks waiting on it, so the poller doesn't reprocess a finished job. */
@Entity
@Table(name = "gemini_collection_batches")
public class GeminiCollectionBatch {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, unique = true, length = 200) private String providerBatchName;
  @Column(nullable = false) private Instant submittedAt = Instant.now();
  @Column(nullable = false) private boolean processed = false;

  protected GeminiCollectionBatch() {}
  GeminiCollectionBatch(String providerBatchName) { this.providerBatchName = providerBatchName; }
  public UUID getId() { return id; }
  public String getProviderBatchName() { return providerBatchName; }
  public Instant getSubmittedAt() { return submittedAt; }
  public boolean isProcessed() { return processed; }
  void markProcessed() { processed = true; }
}
