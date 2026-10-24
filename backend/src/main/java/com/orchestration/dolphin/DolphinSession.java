package com.orchestration.dolphin;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "dolphin_sessions")
public class DolphinSession {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, length = 36) private String ownerId;
  @Column(nullable = false, length = 200) private String title = "새 대화";
  @Column(nullable = false, length = 20) private String mode;
  @Column(length = 200) private String model;
  @Column(nullable = false) private Instant createdAt = Instant.now();
  @Column(nullable = false) private Instant updatedAt = Instant.now();

  protected DolphinSession() {}
  DolphinSession(String ownerId, String mode, String model) {
    this.ownerId = ownerId; this.mode = mode; this.model = model;
  }
  void touch(String firstQuestion) {
    if ("새 대화".equals(title)) title = firstQuestion.length() > 30 ? firstQuestion.substring(0, 30) : firstQuestion;
    updatedAt = Instant.now();
  }
  void setMode(String mode) { this.mode = mode; }
  public UUID getId() { return id; }
  public String getOwnerId() { return ownerId; }
  public String getTitle() { return title; }
  public String getMode() { return mode; }
  public String getModel() { return model; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
}
