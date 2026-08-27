package com.orchestration.tasks;

import jakarta.persistence.*;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "task_events", indexes = {
    @Index(name = "idx_task_events_task_id_created_at", columnList = "task_id, created_at"),
    @Index(name = "idx_task_events_created_at", columnList = "created_at")
})
public class TaskEvent {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private UUID taskId;
  @Column(nullable = false, length = 40) private String stage;
  @Column(nullable = false, length = 1000) private String message;
  @Column(length = 80) private String model;
  private Integer inputTokens;
  private Integer outputTokens;
  private Integer totalTokens;
  private Long elapsedMs;
  @Column(precision = 16, scale = 8) private BigDecimal estimatedCostUsd;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  protected TaskEvent() {}
  TaskEvent(UUID taskId, String stage, String message, String model) { this.taskId = taskId; this.stage = stage; this.message = message; this.model = model; }
  TaskEvent(UUID taskId, String stage, String message, LlmGateway.LlmResult result, BigDecimal estimatedCostUsd) {
    this(taskId, stage, message, result.model());
    this.inputTokens = result.inputTokens(); this.outputTokens = result.outputTokens(); this.totalTokens = result.totalTokens();
    this.elapsedMs = result.elapsedMs(); this.estimatedCostUsd = estimatedCostUsd;
  }
  public UUID getId() { return id; }
  public UUID getTaskId() { return taskId; }
  public String getStage() { return stage; }
  public String getMessage() { return message; }
  public String getModel() { return model; }
  public Integer getInputTokens() { return inputTokens; }
  public Integer getOutputTokens() { return outputTokens; }
  public Integer getTotalTokens() { return totalTokens; }
  public Long getElapsedMs() { return elapsedMs; }
  public BigDecimal getEstimatedCostUsd() { return estimatedCostUsd; }
  public Instant getCreatedAt() { return createdAt; }
}
