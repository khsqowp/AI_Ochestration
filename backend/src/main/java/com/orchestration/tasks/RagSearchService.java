package com.orchestration.tasks;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Answers free-text questions against the obsidian archive: embeds the question, ranks notes by cosine
 * similarity against their (cached) embeddings, then asks DeepSeek to answer using only the top matches. */
@Service
public class RagSearchService {
  private static final Logger log = LoggerFactory.getLogger(RagSearchService.class);
  private static final int TOP_K = 6;
  private static final int CONTEXT_EXCERPT_LIMIT = 1500;
  private static final Pattern ORIGIN_LINE = Pattern.compile("(?m)^origin:\\s*(.*)$");

  private final FileProperties files;
  private final LlmGateway llm;
  private final NoteEmbeddingService embeddingService;
  private final RagConversationRepository conversations;
  private final ObjectMapper json;

  RagSearchService(FileProperties files, LlmGateway llm, NoteEmbeddingService embeddingService, RagConversationRepository conversations, ObjectMapper json) {
    this.files = files;
    this.llm = llm;
    this.embeddingService = embeddingService;
    this.conversations = conversations;
    this.json = json;
  }

  public RagAnswer ask(String question, String domain, String origin) throws Exception {
    List<ScoredNote> ranked = rankNotes(question, domain, origin);
    if (ranked.isEmpty()) {
      RagAnswer empty = new RagAnswer("아카이브에 아직 참고할 노트가 없습니다.", List.of());
      record(question, empty);
      return empty;
    }
    List<ScoredNote> top = ranked.stream().limit(TOP_K).toList();
    String context = top.stream()
        .map(note -> "### " + note.path() + "\n" + limit(note.content(), CONTEXT_EXCERPT_LIMIT))
        .collect(Collectors.joining("\n\n"));
    String system = "당신은 개인 지식 아카이브를 검색해 답하는 리서치 어시스턴트입니다. 아래 제공된 노트 발췌 내용에 근거해서만 답하세요. "
        + "발췌에 없는 내용은 추측하지 말고 모른다고 명확히 밝히세요. 답변 마지막에 실제로 근거로 사용한 노트 경로만 \"참고:\" 목록으로 표시하세요.";
    LlmGateway.LlmResult result = llm.decideWithDeepSeek(system, "질문:\n" + question + "\n\n참고 노트 발췌:\n" + context, 3000);
    List<Citation> citations = top.stream().map(note -> new Citation(note.path(), note.score())).toList();
    log.info("rag_ask_completed candidates={} topScore={}", ranked.size(), top.get(0).score());
    RagAnswer answer = new RagAnswer(result.content(), citations);
    record(question, answer);
    return answer;
  }

  private void record(String question, RagAnswer answer) {
    try {
      conversations.save(new RagConversation(question, answer.answer(), json.writeValueAsString(answer.citations())));
    } catch (Exception exception) {
      log.warn("rag_conversation_record_failed", exception);
    }
  }

  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public List<RagHistoryEntry> history() {
    return conversations.findTop50ByOrderByCreatedAtDesc().stream().map(entry -> {
      List<Citation> citations;
      try {
        citations = List.of(json.readValue(entry.getCitationsJson(), Citation[].class));
      } catch (Exception exception) {
        citations = List.of();
      }
      return new RagHistoryEntry(entry.getId().toString(), entry.getQuestion(), entry.getAnswer(), citations, entry.getCreatedAt().toString());
    }).toList();
  }

  private List<ScoredNote> rankNotes(String question, String domain, String origin) throws Exception {
    Path root = Path.of(files.obsidianPath()).toAbsolutePath().normalize();
    Path archivedRoot = root.resolve("_archived");
    if (!Files.exists(root)) return List.of();
    List<Path> markdowns;
    try (Stream<Path> paths = Files.walk(root, 6)) {
      markdowns = paths.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
          .filter(path -> !path.startsWith(archivedRoot))
          .filter(path -> matchesDomain(root.relativize(path).toString(), domain))
          .toList();
    }
    float[] questionVector = llm.embed(question);
    List<ScoredNote> scored = new ArrayList<>();
    for (Path path : markdowns) {
      try {
        String content = Files.readString(path, StandardCharsets.UTF_8);
        if (!matchesOrigin(content, origin)) continue;
        String relative = root.relativize(path).toString();
        float[] vector = embeddingService.vectorFor(relative, content);
        scored.add(new ScoredNote(relative, content, embeddingService.cosineSimilarity(questionVector, vector)));
      } catch (Exception exception) {
        log.warn("rag_note_skipped path={}", path, exception);
      }
    }
    scored.sort(Comparator.comparingDouble(ScoredNote::score).reversed());
    return scored;
  }

  /** Domain is derived from the note's top-level archive folder (economy/security/ideas), matching how
   * ArchiveController.graph() already categorizes notes — avoids re-parsing frontmatter for this filter. */
  private boolean matchesDomain(String relativePath, String domain) {
    if (domain == null || domain.isBlank()) return true;
    String top = relativePath.contains("/") ? relativePath.substring(0, relativePath.indexOf('/')) : relativePath;
    return top.equalsIgnoreCase(domain);
  }

  private boolean matchesOrigin(String content, String origin) {
    if (origin == null || origin.isBlank()) return true;
    Matcher matcher = ORIGIN_LINE.matcher(content);
    return matcher.find() && matcher.group(1).trim().equalsIgnoreCase(origin);
  }

  private String limit(String text, int max) { return text.length() > max ? text.substring(0, max) : text; }

  public record ScoredNote(String path, String content, double score) {}
  public record Citation(String path, double score) {}
  public record RagAnswer(String answer, List<Citation> citations) {}
  public record RagHistoryEntry(String id, String question, String answer, List<Citation> citations, String createdAt) {}
}
