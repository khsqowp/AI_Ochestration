package com.orchestration.dolphin;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "dolphin_messages")
public class DolphinMessage {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private UUID sessionId;
  @Column(nullable = false) private int position;
  @Column(nullable = false, length = 20) private String role;
  @Lob @Column(nullable = false, columnDefinition = "LONGTEXT") private String content;
  @Lob @Column(columnDefinition = "LONGTEXT") private String sourcesJson;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected DolphinMessage() {}
  DolphinMessage(UUID sessionId, int position, String role, String content, String sourcesJson) {
    this.sessionId = sessionId; this.position = position; this.role = role; this.content = content; this.sourcesJson = sourcesJson;
  }
  public UUID getId() { return id; }
  public int getPosition() { return position; }
  public String getRole() { return role; }
  public String getContent() { return content; }
  public String getSourcesJson() { return sourcesJson; }
}
