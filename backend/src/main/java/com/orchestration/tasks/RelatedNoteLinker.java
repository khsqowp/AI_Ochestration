package com.orchestration.tasks;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
final class RelatedNoteLinker {
  private static final Logger log = LoggerFactory.getLogger(RelatedNoteLinker.class);
  private static final Pattern RELATED_SECTION = Pattern.compile("(?s)\\n## 관련 노트\\n.*$");
  private static final double RELATED_THRESHOLD = 0.16;
  private static final int MAX_RELATED_LINKS = 6;
  private final KnowledgeArchiveService archive;

  RelatedNoteLinker(KnowledgeArchiveService archive) {
    this.archive = archive;
  }

  /**
   * Cross-references notes that are related but not near-duplicate enough to merge (below
   * the candidate threshold, above RELATED_THRESHOLD), using the same free local term-overlap heuristic as the
   * merge pre-filter — no LLM call needed. Rewrites each note's "## 관련 노트" section from scratch every
   * run rather than appending, so re-running the sweep never accumulates duplicate links as relationships
   * change. Link targets are the *filename* stem (not the human title), since that's what
   * {@link com.orchestration.files.ArchiveController#graph} resolves [[wikilinks]] against.
   */
  int linkRelatedNotes(List<Note> notes, double candidateThreshold, List<String> failures) {
    int updated = 0;
    for (Note note : notes) {
      try {
        List<String> relatedStems = new ArrayList<>();
        for (Note other : notes) {
          if (other.path().equals(note.path()) || !other.domain().equals(note.domain())) continue;
          double overlap = archive.overlapRatio(note.content(), other.content());
          if (overlap >= RELATED_THRESHOLD && overlap < candidateThreshold) relatedStems.add(stem(other.path()));
          if (relatedStems.size() >= MAX_RELATED_LINKS) break;
        }
        String current = Files.readString(note.path(), StandardCharsets.UTF_8);
        String withoutSection = RELATED_SECTION.matcher(current).replaceFirst("");
        String next = relatedStems.isEmpty() ? withoutSection
            : withoutSection.stripTrailing() + "\n\n## 관련 노트\n" + relatedStems.stream().map(s -> "- [[" + s + "]]").collect(Collectors.joining("\n")) + "\n";
        if (!next.equals(current)) { Files.writeString(note.path(), next, StandardCharsets.UTF_8); updated++; }
      } catch (Exception exception) {
        log.warn("archive_link_failed path={}", note.relativePath(), exception);
        failures.add(note.relativePath() + ": 관련 노트 링크 갱신 실패 (" + exception.getMessage() + ")");
      }
    }
    return updated;
  }

  private String stem(Path path) { return path.getFileName().toString().replaceFirst("(?i)\\.md$", ""); }

}
