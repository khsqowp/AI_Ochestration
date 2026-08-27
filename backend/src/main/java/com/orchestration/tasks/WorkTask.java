package com.orchestration.tasks;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "work_tasks", indexes = {
    @Index(name = "idx_work_tasks_status", columnList = "status"),
    @Index(name = "idx_work_tasks_created_at", columnList = "created_at")
})
public class WorkTask {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, length = 160) private String title;
  // columnDefinition is explicit here on purpose: @Lob alone with an explicit @Column(nullable=...) and
  // no length falls back to JPA's default length=255, which Hibernate's MySQL dialect maps to TINYTEXT
  // (confirmed via the failed migration: "alter table work_tasks modify column instruction tinytext").
  // Web-scrape and document excerpts embedded here can be several thousand characters.
  @Lob @Column(nullable = false, columnDefinition = "LONGTEXT") private String instruction;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private TaskDomain domain;
  // Nullable at the DB level on purpose: tasks created before this field existed have no origin, and
  // there's no reliable way to infer it retroactively. Every code path that creates a WorkTask now,
  // though, is required (by the constructor signature) to pass one.
  @Enumerated(EnumType.STRING) @Column(length = 20) private TaskOrigin origin;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private TaskStatus status = TaskStatus.QUEUED;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  private Instant completedAt;
  @Column(length = 1024) private String archivePath;
  /** Relative path under originals/ for tasks created from an uploaded image; null for every other task. */
  @Column(length = 1024) private String attachmentPath;
  @Lob @Column(columnDefinition = "LONGTEXT") private String finalReport;
  @Column(length = 500) private String failureReason;
  /** Set when this task's COLLECT stage is deferred to a nightly Gemini batch job instead of running
   * immediately; null for every task that collects in real time. */
  @Column(length = 200) private String batchJobName;
  /** Set only for COLLECTION-origin tasks created from a research source; null for chat/upload tasks.
   * Lets TaskWorkflowRunner report a collection cycle's outcome (content found vs. NO_NEW_CONTENT) back
   * to that specific source, e.g. to track how often it's producing nothing worth archiving. */
  private java.util.UUID sourceId;

  protected WorkTask() {}
  WorkTask(String title, String instruction, TaskDomain domain, TaskOrigin origin) { this(title, instruction, domain, origin, (String) null); }
  WorkTask(String title, String instruction, TaskDomain domain, TaskOrigin origin, String attachmentPath) { this.title = title; this.instruction = instruction; this.domain = domain; this.origin = origin; this.attachmentPath = attachmentPath; }
  WorkTask(String title, String instruction, TaskDomain domain, TaskOrigin origin, java.util.UUID sourceId) { this.title = title; this.instruction = instruction; this.domain = domain; this.origin = origin; this.sourceId = sourceId; }
  public UUID getId() { return id; }
  public String getTitle() { return title; }
  public String getInstruction() { return instruction; }
  public TaskDomain getDomain() { return domain; }
  public TaskOrigin getOrigin() { return origin; }
  public TaskStatus getStatus() { return status; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getCompletedAt() { return completedAt; }
  public String getArchivePath() { return archivePath; }
  public String getAttachmentPath() { return attachmentPath; }
  public String getFinalReport() { return finalReport; }
  public String getFailureReason() { return failureReason; }
  public String getBatchJobName() { return batchJobName; }
  public java.util.UUID getSourceId() { return sourceId; }
  void start() { status = TaskStatus.RUNNING; }
  void complete(String report, String path) { status = TaskStatus.COMPLETED; finalReport = report; archivePath = path; completedAt = Instant.now(); }
  void fail(String reason) { status = TaskStatus.FAILED; failureReason = reason; completedAt = Instant.now(); }
  void cancel() { status = TaskStatus.CANCELLED; completedAt = Instant.now(); }
  void markAwaitingBatch() { status = TaskStatus.AWAITING_BATCH; }
  void attachBatchJob(String jobName) { this.batchJobName = jobName; }
}
