package com.orchestration.tasks;

import com.orchestration.files.FileProperties;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Nightly refresh of the knowledge graph's semantic-similarity edges: embeds every archived note that
 * isn't collection-origin (auto-scraped news the user never asked to see connected), computes pairwise
 * cosine similarity across them, and keeps the top 5 neighbors scoring >= 0.75 as persisted edges. Runs as
 * a scheduled batch instead of on-demand so the graph survives this app's frequent container redeploys and
 * opening the graph panel never pays embedding cost. */
@Service
public class NoteGraphService {
  private static final Logger log = LoggerFactory.getLogger(NoteGraphService.class);
  private static final long MAX_MARKDOWN_BYTES = 1_000_000;
  private static final int TOP_K = 5;
  private static final double MIN_SIMILARITY = 0.75;
  private static final Pattern ORIGIN_LINE = Pattern.compile("(?m)^origin:\\s*(.*)$");

  private final FileProperties files;
  private final NoteEmbeddingService embeddingService;
  private final NoteGraphEdgeRepository edges;

  NoteGraphService(FileProperties files, NoteEmbeddingService embeddingService, NoteGraphEdgeRepository edges) {
    this.files = files;
    this.embeddingService = embeddingService;
    this.edges = edges;
  }

  @Scheduled(cron = "${app.archive.graph-refresh-cron:0 0 6 * * *}", zone = "Asia/Seoul")
  @org.springframework.transaction.annotation.Transactional
  public void refresh() {
    try {
      runNow();
    } catch (Exception exception) {
      log.warn("note_graph_refresh_failed", exception);
    }
  }

  /** Manual trigger for the nightly refresh, so it can be verified without waiting for 06:00. */
  @org.springframework.transaction.annotation.Transactional
  public GraphRefreshResult runNow() throws Exception {
    Path root = Path.of(files.obsidianPath()).toAbsolutePath().normalize();
    if (!Files.exists(root)) return new GraphRefreshResult(0, 0);
    Path archivedRoot = root.resolve("_archived");
    List<Path> markdowns;
    try (Stream<Path> paths = Files.walk(root, 6)) {
      markdowns = paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
          .filter(path -> !path.startsWith(archivedRoot))
          .toList();
    }
    List<Note> notes = new ArrayList<>();
    for (Path path : markdowns) {
      if (Files.size(path) > MAX_MARKDOWN_BYTES) continue;
      String content = Files.readString(path, StandardCharsets.UTF_8);
      if (isCollectionOrigin(content)) continue;
      String relative = root.relativize(path).toString();
      try {
        notes.add(new Note(relative, embeddingService.vectorFor(relative, content)));
      } catch (Exception exception) {
        log.warn("note_graph_embed_skipped path={}", relative, exception);
      }
    }
    List<NoteGraphEdge> refreshed = new ArrayList<>();
    for (Note note : notes) {
      List<Scored> neighbors = new ArrayList<>();
      for (Note other : notes) {
        if (other.path().equals(note.path())) continue;
        double score = embeddingService.cosineSimilarity(note.vector(), other.vector());
        if (score >= MIN_SIMILARITY) neighbors.add(new Scored(other.path(), score));
      }
      neighbors.sort(Comparator.comparingDouble(Scored::score).reversed());
      neighbors.stream().limit(TOP_K).forEach(neighbor -> refreshed.add(new NoteGraphEdge(note.path(), neighbor.path(), neighbor.score())));
    }
    edges.deleteAllInBatch();
    edges.saveAll(refreshed);
    log.info("note_graph_refresh_completed notes={} edges={}", notes.size(), refreshed.size());
    return new GraphRefreshResult(notes.size(), refreshed.size());
  }

  private boolean isCollectionOrigin(String content) {
    Matcher matcher = ORIGIN_LINE.matcher(content);
    return matcher.find() && matcher.group(1).trim().equalsIgnoreCase("collection");
  }

  private record Note(String path, float[] vector) {}
  private record Scored(String path, double score) {}
  public record GraphRefreshResult(int notesEmbedded, int edgesWritten) {}
}
