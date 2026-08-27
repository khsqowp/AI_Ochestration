package com.orchestration.tasks;

import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Shared, fixed-choice classifier for the security archive's 11-category scheme (see the one-time
 * reorg this scheme was introduced for). Both {@link ArchiveMaintenanceService} (sorting existing manual
 * notes into buckets) and {@link KnowledgeArchiveService} (routing incoming collection notes) need the
 * exact same closed category list — duplicating it in two places would let them drift apart.
 */
@Component
public class SecurityCategoryClassifier {
  public static final String SECURITY_DOMAIN = "security";
  // Collection (news) output is classified into the same 11 categories but kept physically separate
  // from the curated manual/upload notes living directly under security/<category>/ -- raw scraped
  // news doesn't need to (and shouldn't) share a file with hand-reviewed knowledge-base notes.
  public static final String NEWS_SEGMENT = "뉴스";
  public static final List<String> CATEGORIES = List.of(
      "웹", "OS", "모바일", "클라우드", "웹서버-WAS-엔진", "데이터베이스", "모의해킹", "보안장비", "암호학", "이외", "AI");

  private static final int EXCERPT_CHARS = 1500;

  private final LlmGateway llm;

  SecurityCategoryClassifier(LlmGateway llm) { this.llm = llm; }

  /** Out-of-list responses fall back to "이외" rather than being trusted verbatim, so the archive never
   * drifts into a 12th ad-hoc category. */
  public String classify(String title, String content) throws Exception {
    String system = "당신은 보안 지식 아카이브의 큐레이터입니다. 주어진 글이 다음 카테고리 중 정확히 어디에 속하는지 하나만 고르세요: "
        + String.join(", ", CATEGORIES) + ". "
        + "다른 설명이나 문장부호 없이 목록에 있는 이름 그대로 한 줄만 출력하세요. 애매하면 \"이외\"를 출력하세요.";
    String prompt = "제목: " + title + "\n\n본문 일부:\n" + truncate(content);
    LlmGateway.LlmResult result = llm.classifyWithDeepSeek(system, prompt);
    String raw = result.content().trim();
    return CATEGORIES.contains(raw) ? raw : "이외";
  }

  private String truncate(String value) {
    return value.length() <= EXCERPT_CHARS ? value : value.substring(0, EXCERPT_CHARS) + "\n[길이 제한으로 일부 생략]";
  }
}
