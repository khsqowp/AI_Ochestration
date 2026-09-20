package com.orchestration.training;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Persistent reuse record. It prevents charging the user twice for an identical answer and rubric. */
@Entity
@Table(name = "training_evaluation_cache", uniqueConstraints = @UniqueConstraint(name = "uk_training_evaluation_cache_key", columnNames = "cache_key"))
public class TrainingEvaluationCache {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(name = "cache_key", nullable = false, length = 64) private String cacheKey;
  @Column(nullable = false, length = 40) private String provider;
  @Column(nullable = false, length = 120) private String model;
  @Lob @Column(columnDefinition = "TEXT", nullable = false) private String resultJson;
  @Column(nullable = false) private double score;
  @Lob @Column(columnDefinition = "TEXT", nullable = false) private String feedbackMd;
  private int inputTokens;
  private int outputTokens;
  private int totalTokens;
  private long elapsedMs;
  @Column(precision = 16, scale = 8) private BigDecimal estimatedCostUsd;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  protected TrainingEvaluationCache() {}
  TrainingEvaluationCache(String cacheKey, String provider, String model, String resultJson, double score, String feedbackMd,
      int inputTokens, int outputTokens, int totalTokens, long elapsedMs, BigDecimal estimatedCostUsd) {
    this.cacheKey = cacheKey; this.provider = provider; this.model = model; this.resultJson = resultJson; this.score = score;
    this.feedbackMd = feedbackMd; this.inputTokens = inputTokens; this.outputTokens = outputTokens; this.totalTokens = totalTokens;
    this.elapsedMs = elapsedMs; this.estimatedCostUsd = estimatedCostUsd;
  }
  public String getProvider() { return provider; } public String getModel() { return model; } public String getResultJson() { return resultJson; }
  public double getScore() { return score; } public String getFeedbackMd() { return feedbackMd; }
  public int getInputTokens() { return inputTokens; } public int getOutputTokens() { return outputTokens; }
  public int getTotalTokens() { return totalTokens; } public long getElapsedMs() { return elapsedMs; }
  public BigDecimal getEstimatedCostUsd() { return estimatedCostUsd; }
}
