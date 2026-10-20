package com.orchestration.notebook;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notebook_image")
public class NotebookImage {
  @Id private UUID id;
  @Column(nullable = false) private UUID entryId;
  @Column(nullable = false) private UUID ownerId;
  @Column(nullable = false, length = 255) private String storedFilename;
  @Column(nullable = false, length = 255) private String originalFilename;
  @Column(nullable = false, length = 100) private String contentType;
  @Column(nullable = false) private Instant createdAt;

  protected NotebookImage() {}
  public NotebookImage(UUID id, UUID entryId, UUID ownerId, String storedFilename, String originalFilename, String contentType, Instant createdAt) {
    this.id = id; this.entryId = entryId; this.ownerId = ownerId; this.storedFilename = storedFilename;
    this.originalFilename = originalFilename; this.contentType = contentType; this.createdAt = createdAt;
  }
  public UUID getId() { return id; }
  public UUID getEntryId() { return entryId; }
  public UUID getOwnerId() { return ownerId; }
  public String getStoredFilename() { return storedFilename; }
  public String getOriginalFilename() { return originalFilename; }
  public String getContentType() { return contentType; }
  public Instant getCreatedAt() { return createdAt; }
}
