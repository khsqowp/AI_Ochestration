package com.orchestration.notebook;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notebook_entry")
public class NotebookEntry {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private UUID ownerId;
  @Column(nullable = false, length = 320) private String ownerEmail;
  @Column(nullable = false, length = 120) private String ownerDisplayName;
  @Column(nullable = false, length = 200) private String title;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 40) private NotebookStatus status;
  @Column(nullable = false, columnDefinition = "LONGTEXT") private String content;
  @Column(nullable = false) private Instant createdAt;
  @Column(nullable = false) private Instant updatedAt;

  protected NotebookEntry() {}
  public NotebookEntry(UUID ownerId, String ownerEmail, String ownerDisplayName, String title, NotebookStatus status, Instant now) {
    this.ownerId = ownerId; this.ownerEmail = ownerEmail; this.ownerDisplayName = ownerDisplayName;
    this.title = title; this.status = status; this.content = ""; this.createdAt = now; this.updatedAt = now;
  }
  public UUID getId() { return id; }
  public UUID getOwnerId() { return ownerId; }
  public String getOwnerEmail() { return ownerEmail; }
  public String getOwnerDisplayName() { return ownerDisplayName; }
  public String getTitle() { return title; }
  public NotebookStatus getStatus() { return status; }
  public String getContent() { return content; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setTitle(String title) { this.title = title; }
  public void setStatus(NotebookStatus status) { this.status = status; }
  public void setContent(String content) { this.content = content; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
