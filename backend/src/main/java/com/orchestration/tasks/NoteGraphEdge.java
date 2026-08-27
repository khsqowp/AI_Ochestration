package com.orchestration.tasks;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** One precomputed semantic-similarity edge between two archive notes, refreshed nightly by
 * NoteGraphService so the knowledge graph survives this app's frequent container redeploys without
 * recomputing embeddings on every page load. */
@Entity
@Table(name = "note_graph_edges")
public class NoteGraphEdge {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, length = 1024) private String fromPath;
  @Column(nullable = false, length = 1024) private String toPath;
  @Column(nullable = false) private double score;
  @Column(nullable = false) private Instant updatedAt = Instant.now();

  protected NoteGraphEdge() {}
  NoteGraphEdge(String fromPath, String toPath, double score) { this.fromPath = fromPath; this.toPath = toPath; this.score = score; }

  public String getFromPath() { return fromPath; }
  public String getToPath() { return toPath; }
  public double getScore() { return score; }
}
