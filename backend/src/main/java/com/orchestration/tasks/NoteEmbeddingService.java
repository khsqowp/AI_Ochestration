package com.orchestration.tasks;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.stereotype.Service;

/** Shared "ensure this note's embedding is current" logic, reused by RagSearchService's live question
 * answering and NoteGraphService's scheduled similarity-graph refresh, so both pay for a fresh embedding
 * call only when a note's text actually changed since it was last embedded. */
@Service
public class NoteEmbeddingService {
  private static final int EMBED_INPUT_LIMIT = 6000;

  private final LlmGateway llm;
  private final NoteEmbeddingRepository embeddings;
  private final ObjectMapper json;

  NoteEmbeddingService(LlmGateway llm, NoteEmbeddingRepository embeddings, ObjectMapper json) {
    this.llm = llm;
    this.embeddings = embeddings;
    this.json = json;
  }

  public float[] vectorFor(String relativePath, String content) throws Exception {
    String hash = sha256(content);
    var existing = embeddings.findByPath(relativePath);
    if (existing.isPresent() && existing.get().getContentHash().equals(hash)) {
      return json.readValue(existing.get().getVectorJson(), float[].class);
    }
    float[] vector = llm.embed(limit(content, EMBED_INPUT_LIMIT));
    String vectorJson = json.writeValueAsString(vector);
    if (existing.isPresent()) {
      existing.get().update(hash, vectorJson);
      embeddings.save(existing.get());
    } else {
      embeddings.save(new NoteEmbedding(relativePath, hash, vectorJson));
    }
    return vector;
  }

  public double cosineSimilarity(float[] a, float[] b) {
    if (a.length != b.length) return -1;
    double dot = 0, normA = 0, normB = 0;
    for (int i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
    if (normA == 0 || normB == 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private String limit(String text, int max) { return text.length() > max ? text.substring(0, max) : text; }

  private String sha256(String content) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
    return HexFormat.of().formatHex(digest);
  }
}
