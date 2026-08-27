package com.orchestration.tasks;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** One archive Q&A turn, persisted so the "아카이브 질문" history survives a page reload — the UI only
 * ever kept this in local component state before, which meant closing the modal lost it. */
@Entity
@Table(name = "rag_conversations", indexes = @Index(name = "idx_rag_conversations_created_at", columnList = "created_at"))
public class RagConversation {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Lob @Column(nullable = false, columnDefinition = "LONGTEXT") private String question;
  @Lob @Column(nullable = false, columnDefinition = "LONGTEXT") private String answer;
  /** JSON array of {path, score}, serialized with the same ObjectMapper the rest of the app uses. */
  @Lob @Column(nullable = false, columnDefinition = "LONGTEXT") private String citationsJson;
  @Column(nullable = false) private Instant createdAt = Instant.now();

  protected RagConversation() {}
  RagConversation(String question, String answer, String citationsJson) { this.question = question; this.answer = answer; this.citationsJson = citationsJson; }

  public UUID getId() { return id; }
  public String getQuestion() { return question; }
  public String getAnswer() { return answer; }
  public String getCitationsJson() { return citationsJson; }
  public Instant getCreatedAt() { return createdAt; }
}
