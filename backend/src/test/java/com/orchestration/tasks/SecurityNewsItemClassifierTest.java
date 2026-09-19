package com.orchestration.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Covers the two failure modes {@link SecurityNewsItemClassifier} must degrade safely from — a broken/
 * empty LLM call, and an LLM response that looks well-formed but drops or invents too much body text —
 * without ever silently losing the source report's content. */
class SecurityNewsItemClassifierTest {

  private SecurityNewsItemClassifier classifierReturning(String rawJson) throws Exception {
    LlmGateway llm = mock(LlmGateway.class);
    when(llm.splitJsonWithDeepSeek(anyString(), anyString(), anyInt()))
        .thenReturn(new LlmGateway.LlmResult("DeepSeek", "deepseek-v4-pro", rawJson, 0, 0, 0, 0));
    return new SecurityNewsItemClassifier(llm, new ObjectMapper());
  }

  @Test
  void split_returnsEachItemWithItsOwnType_whenResponseIsWellFormed() throws Exception {
    String report = "랜섬웨어 조직이 병원을 공격했다는 내용입니다.\n\nAI 에이전트가 침투 시간을 단축시켰다는 내용입니다.";
    SecurityNewsItemClassifier classifier = classifierReturning("""
        {"items":[
          {"type":"랜섬웨어","title":"병원 랜섬웨어 공격","body":"랜섬웨어 조직이 병원을 공격했다는 내용입니다."},
          {"type":"AI 보안","title":"AI 침투 가속","body":"AI 에이전트가 침투 시간을 단축시켰다는 내용입니다."}
        ]}
        """);

    List<SecurityNewsItemClassifier.NewsItem> items = classifier.split("Test Source", report, List.of("랜섬웨어"));

    assertThat(items).hasSize(2);
    assertThat(items.get(0).type()).isEqualTo("랜섬웨어");
    assertThat(items.get(1).type()).isEqualTo("AI 보안");
  }

  @Test
  void split_stripsMarkdownCodeFence_beforeParsingJson() throws Exception {
    String report = "단일 소식 본문입니다.";
    SecurityNewsItemClassifier classifier = classifierReturning("```json\n"
        + "{\"items\":[{\"type\":\"해킹사고\",\"title\":\"단일 소식\",\"body\":\"단일 소식 본문입니다.\"}]}\n"
        + "```");

    List<SecurityNewsItemClassifier.NewsItem> items = classifier.split("Test Source", report, List.of());

    assertThat(items).singleElement().satisfies(item -> assertThat(item.type()).isEqualTo("해킹사고"));
  }

  @Test
  void split_fallsBackToOneWholeReportItem_whenReturnedBodyIsFarShorterThanOriginal() throws Exception {
    String report = "이 리포트는 아주 길고 자세한 여러 문단으로 구성된 본문입니다. ".repeat(20);
    // 모델이 한 줄만 남기고 나머지를 잘라먹은 상황을 흉내낸다 — 길이비가 MIN_LENGTH_RATIO 밖으로 벗어난다.
    SecurityNewsItemClassifier classifier = classifierReturning(
        "{\"items\":[{\"type\":\"해킹사고\",\"title\":\"요약\",\"body\":\"짧게 잘린 본문.\"}]}");

    List<SecurityNewsItemClassifier.NewsItem> items = classifier.split("Test Source", report, List.of());

    assertThat(items).singleElement().satisfies(item -> {
      assertThat(item.type()).isEqualTo(SecurityNewsItemClassifier.FALLBACK_TYPE);
      assertThat(item.body()).isEqualTo(report);
    });
  }

  @Test
  void split_fallsBackToOneWholeReportItem_whenLlmCallThrows() throws Exception {
    LlmGateway llm = mock(LlmGateway.class);
    when(llm.splitJsonWithDeepSeek(anyString(), anyString(), anyInt())).thenThrow(new RuntimeException("DeepSeek API key missing"));
    SecurityNewsItemClassifier classifier = new SecurityNewsItemClassifier(llm, new ObjectMapper());
    String report = "출처 리포트 원문입니다.";

    List<SecurityNewsItemClassifier.NewsItem> items = classifier.split("Test Source", report, List.of());

    assertThat(items).singleElement().satisfies(item -> {
      assertThat(item.type()).isEqualTo(SecurityNewsItemClassifier.FALLBACK_TYPE);
      assertThat(item.title()).isEqualTo("Test Source");
      assertThat(item.body()).isEqualTo(report);
    });
  }

  @Test
  void split_fallsBackToOneWholeReportItem_whenResponseIsMalformedJson() throws Exception {
    SecurityNewsItemClassifier classifier = classifierReturning("이건 JSON이 아니라 모델이 그냥 산문으로 답한 경우입니다.");
    String report = "출처 리포트 원문입니다.";

    List<SecurityNewsItemClassifier.NewsItem> items = classifier.split("Test Source", report, List.of());

    assertThat(items).singleElement().satisfies(item -> assertThat(item.body()).isEqualTo(report));
  }
}
