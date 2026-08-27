package com.orchestration.tasks;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Caches one embedding vector per archive note, keyed by content hash, so RAG search only pays for a
 * fresh OpenAI embedding call when a note's text actually changed since the last question was asked. */
@Entity
@Table(name = "note_embeddings")
public class NoteEmbedding {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, unique = true, length = 1024) private String path;
  @Column(nullable = false, length = 64) private String contentHash;
  @Lob @Column(nullable = false, columnDefinition = "LONGTEXT") private String vectorJson;
  @Column(nullable = false) private Instant updatedAt = Instant.now();

  protected NoteEmbedding() {}
  NoteEmbedding(String path, String contentHash, String vectorJson) { this.path = path; this.contentHash = contentHash; this.vectorJson = vectorJson; }

  public UUID getId() { return id; }
  public String getPath() { return path; }
  public String getContentHash() { return contentHash; }
  public String getVectorJson() { return vectorJson; }
  public Instant getUpdatedAt() { return updatedAt; }
  void update(String contentHash, String vectorJson) { this.contentHash = contentHash; this.vectorJson = vectorJson; this.updatedAt = Instant.now(); }
}
