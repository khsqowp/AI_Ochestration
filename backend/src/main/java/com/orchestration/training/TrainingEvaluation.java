package com.orchestration.training;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "training_attempt_evaluation", indexes = {
    @Index(name = "idx_training_evaluation_created", columnList = "created_at"),
    @Index(name = "idx_training_evaluation_model", columnList = "model")
})
public class TrainingEvaluation {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "attempt_id", nullable = false, unique = true) private TrainingAttempt attempt;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private TrainingEvaluationStatus status;
  @Column(nullable = false, length = 40) private String provider;
  @Column(nullable = false, length = 120) private String model;
  @Column(nullable = false, length = 40) private String rubricVersion;
  @Column(nullable = false, length = 64) private String answerHash;
  @Lob @Column(columnDefinition = "TEXT") private String resultJson;
  @Lob @Column(columnDefinition = "TEXT") private String errorMessage;
  private Integer inputTokens;
  private Integer outputTokens;
  private Integer totalTokens;
  private Long elapsedMs;
  @Column(precision = 16, scale = 8) private BigDecimal estimatedCostUsd;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected TrainingEvaluation() {}
  TrainingEvaluation(TrainingAttempt attempt, String provider, String model, String rubricVersion, String answerHash,
      TrainingEvaluationStatus status, String resultJson, String errorMessage, Integer inputTokens, Integer outputTokens,
      Integer totalTokens, Long elapsedMs, BigDecimal estimatedCostUsd) {
    this.attempt = attempt; this.provider = provider; this.model = model; this.rubricVersion = rubricVersion;
    this.answerHash = answerHash; this.status = status; this.resultJson = resultJson; this.errorMessage = errorMessage;
    this.inputTokens = inputTokens; this.outputTokens = outputTokens; this.totalTokens = totalTokens;
    this.elapsedMs = elapsedMs; this.estimatedCostUsd = estimatedCostUsd;
  }
  public TrainingEvaluationStatus getStatus() { return status; }
  public TrainingAttempt getAttempt() { return attempt; }
  public String getProvider() { return provider; }
  public String getModel() { return model; }
  public String getRubricVersion() { return rubricVersion; }
  public String getResultJson() { return resultJson; }
  public String getErrorMessage() { return errorMessage; }
  public Integer getInputTokens() { return inputTokens; }
  public Integer getOutputTokens() { return outputTokens; }
  public Integer getTotalTokens() { return totalTokens; }
  public Long getElapsedMs() { return elapsedMs; }
  public BigDecimal getEstimatedCostUsd() { return estimatedCostUsd; }
  public Instant getCreatedAt() { return createdAt; }
}
