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
@Table(name = "feedback_report", indexes = {
    @Index(name = "idx_feedback_report_author_created", columnList = "author_id, created_at"),
    @Index(name = "idx_feedback_report_created", columnList = "created_at")
})
public class FeedbackReport {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(name = "author_id", nullable = false, columnDefinition = "BINARY(16)") private UUID authorId;
  @Column(name = "author_email", nullable = false, length = 320) private String authorEmail;
  @Column(name = "author_display_name", nullable = false, length = 120) private String authorDisplayName;
  @Column(nullable = false, length = 160) private String title;
  @Column(nullable = false, columnDefinition = "TEXT") private String body;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

  protected FeedbackReport() {}

  FeedbackReport(UUID authorId, String authorEmail, String authorDisplayName, String title, String body) {
    this.authorId = authorId;
    this.authorEmail = authorEmail;
    this.authorDisplayName = authorDisplayName;
    this.title = title;
    this.body = body;
  }

  public UUID getId() { return id; }
  public UUID getAuthorId() { return authorId; }
  public String getAuthorEmail() { return authorEmail; }
  public String getAuthorDisplayName() { return authorDisplayName; }
  public String getTitle() { return title; }
  public String getBody() { return body; }
  public Instant getCreatedAt() { return createdAt; }
}
