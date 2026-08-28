package com.orchestration.tasks;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * 찬반토론(PRO_CON)/자유토론(FREE) 세션. Gemini는 어느 모드에서도 토론자가 아니라 리서처
 * 역할로 고정된다(웹검색이 되는 유일한 provider라서) — participants/proModel/conModel에는
 * 절대 포함되지 않는다.
 */
@Entity
@Table(name = "debate_sessions")
public class DebateSession {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private DebateMode mode;
  @Column(nullable = false, length = 2000) private String topic;
  @Column(length = 20) private String proModel;   // PRO_CON 전용
  @Column(length = 20) private String conModel;   // PRO_CON 전용
  @Column(length = 100) private String participants; // FREE 전용, 콤마 구분 (예: "DEEPSEEK,OPENAI")
  @Column(nullable = false) private int maxTurnsPerSide;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private DebateStatus status = DebateStatus.IN_PROGRESS;
  @Column(nullable = false) private int turnsCompleted = 0;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected DebateSession() {}

  DebateSession(DebateMode mode, String topic, String proModel, String conModel, String participants, int maxTurnsPerSide) {
    this.mode = mode; this.topic = topic; this.proModel = proModel; this.conModel = conModel;
    this.participants = participants; this.maxTurnsPerSide = maxTurnsPerSide;
  }

  public UUID getId() { return id; }
  public DebateMode getMode() { return mode; }
  public String getTopic() { return topic; }
  public String getProModel() { return proModel; }
  public String getConModel() { return conModel; }
  public String getParticipants() { return participants; }
  public int getMaxTurnsPerSide() { return maxTurnsPerSide; }
  public DebateStatus getStatus() { return status; }
  public void setStatus(DebateStatus status) { this.status = status; }
  public int getTurnsCompleted() { return turnsCompleted; }
  public void incrementTurnsCompleted() { this.turnsCompleted++; }
  public Instant getCreatedAt() { return createdAt; }
}
