package com.orchestration.feedback;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "feedback_notification", indexes = @Index(name = "idx_feedback_notification_recipient_created", columnList = "recipient_id, created_at"))
public class FeedbackNotification {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(name = "recipient_id", nullable = false, columnDefinition = "BINARY(16)") private UUID recipientId;
  @Column(name = "report_id", nullable = false, columnDefinition = "BINARY(16)") private UUID reportId;
  @Column(name = "comment_id", nullable = false, columnDefinition = "BINARY(16)") private UUID commentId;
  @Column(name = "report_title", nullable = false, length = 160) private String reportTitle;
  @Column(name = "comment_preview", nullable = false, length = 300) private String commentPreview;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  @Column(name = "toast_shown_at") private Instant toastShownAt;
  @Column(name = "read_at") private Instant readAt;

  protected FeedbackNotification() {}

  FeedbackNotification(UUID recipientId, UUID reportId, UUID commentId, String reportTitle, String commentPreview) {
    this.recipientId = recipientId;
    this.reportId = reportId;
    this.commentId = commentId;
    this.reportTitle = reportTitle;
    this.commentPreview = commentPreview.length() > 300 ? commentPreview.substring(0, 300) : commentPreview;
  }

  public UUID getId() { return id; }
  public UUID getRecipientId() { return recipientId; }
  public UUID getReportId() { return reportId; }
  public UUID getCommentId() { return commentId; }
  public String getReportTitle() { return reportTitle; }
  public String getCommentPreview() { return commentPreview; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getToastShownAt() { return toastShownAt; }
  public Instant getReadAt() { return readAt; }
  void markToastShown(Instant now) { if (toastShownAt == null) toastShownAt = now; }
  void markRead(Instant now) { if (readAt == null) readAt = now; }
}
