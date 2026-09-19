package com.orchestration.tasks;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Splits one source's collected security-news report into individual items, each tagged with a broad,
 * reusable "뉴스 유형" (해킹사고, 랜섬웨어, AI 보안, 네트워크 보안…) — the set is never a fixed enum, it grows
 * organically as {@link #split} sees new kinds of news, biased toward reusing an already-seen label over
 * inventing a near-duplicate (see the {@code knownTypes} parameter).
 *
 * <p>The historical failure this avoids: an earlier version classified an entire source's daily digest
 * into one category, which was nearly meaningless — a single day's excerpt from one source routinely
 * bundles several unrelated stories (see {@link KnowledgeArchiveService}'s javadoc for why that scheme was
 * abandoned 2026-08-28). Splitting first, then classifying each piece, fixes that — but asking a model to
 * reproduce body text verbatim risks silently truncating or paraphrasing it away (the exact failure {@code
 * ArchiveMaintenanceService#trySplitBucket} hit once on an oversized bucket). A single source's daily
 * report is small enough that echoing it back is safe here (unlike that bucket case spanning many notes),
 * so the guard is a length-ratio sanity check instead of avoiding body echo altogether: if the returned
 * items' combined body length falls far outside the original report's length, the split is untrusted and
 * this falls back to one whole-report item under a fixed catch-all type — content is never silently
 * dropped, only ever left unsplit.
 */
@Component
class SecurityNewsItemClassifier {
  private static final Logger log = LoggerFactory.getLogger(SecurityNewsItemClassifier.class);
  static final String FALLBACK_TYPE = "종합";
  private static final double MIN_LENGTH_RATIO = 0.8;
  private static final double MAX_LENGTH_RATIO = 1.3;
  private static final int MAX_OUTPUT_TOKENS = 4500;

  private final LlmGateway llm;
  private final ObjectMapper json;

  SecurityNewsItemClassifier(LlmGateway llm, ObjectMapper json) {
    this.llm = llm;
    this.json = json;
  }

  record NewsItem(String type, String title, String body) {}

  List<NewsItem> split(String sourceTitle, String report, List<String> knownTypes) {
    try {
      List<NewsItem> items = attempt(sourceTitle, report, knownTypes);
      if (isTrustworthy(items, report)) return items;
      log.warn("security_news_split_untrusted source={} reportChars={} — 폴백: 전체를 '{}' 유형 하나로 보관",
          sourceTitle, report.length(), FALLBACK_TYPE);
    } catch (Exception exception) {
      log.warn("security_news_split_failed source={}", sourceTitle, exception);
    }
    return List.of(new NewsItem(FALLBACK_TYPE, sourceTitle, report));
  }

  private List<NewsItem> attempt(String sourceTitle, String report, List<String> knownTypes) throws Exception {
    String system = """
        당신은 보안 뉴스 수집 파이프라인의 분류기입니다. 입력은 한 출처에서 수집한 보안 뉴스 발췌이며,
        서로 무관한 개별 소식이 여러 개 섞여 있을 수 있습니다. 이를 서로 다른 개별 뉴스 항목으로 나누고,
        각 항목에 넓고 재사용 가능한 "유형"을 붙이세요.

        유형은 "해킹사고", "랜섬웨어", "AI 보안", "네트워크 보안", "데이터 유출", "취약점·패치", "피싱·사기",
        "규제·정책" 처럼 2~6단어의 넓은 한국어 명사구여야 합니다. 특정 회사명, CVE 번호, 인물명 같은 고유
        명사를 유형 이름에 쓰지 마세요 — 유형은 여러 날, 여러 출처에 걸쳐 반복해서 재사용될 이름입니다.

        기존 유형 목록(자연스럽게 맞는 게 있으면 철자 하나도 바꾸지 말고 정확히 그대로 재사용하세요): """
        + (knownTypes.isEmpty() ? "(아직 없음)" : String.join(", ", knownTypes)) + """

        목록에 맞는 게 없을 때만 새 유형을 만드세요. 하나의 소식이 여러 유형에 걸치면 가장 핵심적인 유형
        하나만 고르세요.

        각 항목의 "body"는 원문 텍스트를 요약하거나 다시 쓰지 말고 그대로(단어 하나도 바꾸지 않고) 옮기세요
        — 문단을 나누거나 합치지 말고 원문 구조를 그대로 유지하세요. "title"은 그 항목의 핵심을 담은 15자
        내외 한국어 제목입니다.

        반드시 이 형식의 JSON 객체 하나만 반환하세요, 다른 설명은 쓰지 마세요:
        {"items":[{"type":"...","title":"...","body":"..."}]}
        """;
    String prompt = "출처: " + sourceTitle + "\n\n원문:\n" + report;
    LlmGateway.LlmResult result = llm.splitJsonWithDeepSeek(system, prompt, MAX_OUTPUT_TOKENS);
    String raw = result.content().trim().replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
    JsonNode root = json.readTree(raw);
    List<NewsItem> items = new ArrayList<>();
    for (JsonNode node : root.path("items")) {
      String type = node.path("type").asText("").trim();
      String title = node.path("title").asText("").trim();
      String body = node.path("body").asText("").trim();
      if (type.isBlank() || body.isBlank()) continue;
      items.add(new NewsItem(type, title.isBlank() ? sourceTitle : title, body));
    }
    return items;
  }

  private boolean isTrustworthy(List<NewsItem> items, String originalReport) {
    if (items.isEmpty() || originalReport.isEmpty()) return false;
    int combined = items.stream().mapToInt(item -> item.body().length()).sum();
    double ratio = (double) combined / originalReport.length();
    return ratio >= MIN_LENGTH_RATIO && ratio <= MAX_LENGTH_RATIO;
  }
}
