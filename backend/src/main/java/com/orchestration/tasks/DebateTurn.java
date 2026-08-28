package com.orchestration.tasks;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** 토론 한 발언. role은 "PRO"/"CON"/"PARTICIPANT_1".."PARTICIPANT_N"/"RESEARCH" 중 하나. */
@Entity
@Table(name = "debate_turns", indexes = {
    @Index(name = "idx_debate_turns_session_id_turn_index", columnList = "session_id, turn_index")
})
public class DebateTurn {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false) private UUID sessionId;
  @Column(nullable = false) private int turnIndex;
  @Column(nullable = false, length = 20) private String role;
  @Column(nullable = false, length = 20) private String speakerModel;
  @Lob @Column(nullable = false) private String content;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected DebateTurn() {}

  DebateTurn(UUID sessionId, int turnIndex, String role, String speakerModel, String content) {
    this.sessionId = sessionId; this.turnIndex = turnIndex; this.role = role;
    this.speakerModel = speakerModel; this.content = content;
  }

  public UUID getId() { return id; }
  public UUID getSessionId() { return sessionId; }
  public int getTurnIndex() { return turnIndex; }
  public String getRole() { return role; }
  public String getSpeakerModel() { return speakerModel; }
  public String getContent() { return content; }
  public Instant getCreatedAt() { return createdAt; }
}
