package com.orchestration.tasks;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/** Cached embeddings for live RAG queries, with background refresh on misses; the nightly graph job
 * can still use vectorFor synchronously to ensure every note's embedding is current. */
@Service
public class NoteEmbeddingService {
  private static final Logger log = LoggerFactory.getLogger(NoteEmbeddingService.class);
  private static final int EMBED_INPUT_LIMIT = 6000;

  private final LlmGateway llm;
  private final NoteEmbeddingRepository embeddings;
  private final ObjectMapper json;

  NoteEmbeddingService(LlmGateway llm, NoteEmbeddingRepository embeddings, ObjectMapper json) {
    this.llm = llm;
    this.embeddings = embeddings;
    this.json = json;
  }

  public Optional<float[]> cachedVectorFor(String relativePath, String content) throws Exception {
    String hash = sha256(content);
    var existing = embeddings.findByPath(relativePath);
    if (existing.isEmpty() || !existing.get().getContentHash().equals(hash)) return Optional.empty();
    return Optional.of(json.readValue(existing.get().getVectorJson(), float[].class));
  }

  @Async("embeddingRefreshExecutor")
  public void refreshAsync(String relativePath, String content) {
    try {
      vectorFor(relativePath, content);
    } catch (Exception exception) {
      log.warn("note_embedding_refresh_failed path={}", relativePath, exception);
    }
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
