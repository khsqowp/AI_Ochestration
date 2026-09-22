package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.tasks.LlmGateway;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class BlackBoxPatternAnalyzerTest {
  @Mock private LlmGateway llm;
  private final ObjectMapper json = new ObjectMapper();

  private BlackBoxPatternAnalyzer analyzer(boolean enabled) {
    return new BlackBoxPatternAnalyzer(llm, json, enabled, "OPENAI");
  }

  @Test
  void does_not_call_the_model_when_fewer_than_five_sessions_are_available() {
    String result = analyzer(true).analyze("SQLI_QUERY", List.of("a", "b", "c", "d"));

    assertThat(result).isNull();
    verifyNoInteractions(llm);
  }

  @Test
  void does_not_call_the_model_when_disabled() {
    String result = analyzer(false).analyze("SQLI_QUERY", List.of("a", "b", "c", "d", "e"));

    assertThat(result).isNull();
    verifyNoInteractions(llm);
  }

  @Test
  void returns_the_pattern_text_parsed_from_a_well_formed_json_reply() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(any(), any())).thenReturn(
        new LlmGateway.LlmResult("openai", "gpt-4o-mini", "{\"pattern\":\"블라인드 SQLi에서 시간차 확인을 반복적으로 빠뜨림\"}", 10, 10, 20, 5));

    String result = analyzer(true).analyze("SQLI_QUERY", List.of("a", "b", "c", "d", "e"));

    assertThat(result).isEqualTo("블라인드 SQLi에서 시간차 확인을 반복적으로 빠뜨림");
  }

  @Test
  void returns_null_when_the_model_reports_no_clear_pattern() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(any(), any())).thenReturn(
        new LlmGateway.LlmResult("openai", "gpt-4o-mini", "{\"pattern\":\"패턴 없음\"}", 10, 10, 20, 5));

    String result = analyzer(true).analyze("SQLI_QUERY", List.of("a", "b", "c", "d", "e"));

    // "패턴 없음"이라는 문자열 자체는 그대로 돌려준다 -- 호출부(refreshBlackBoxAssessment)가 이 문자열을
    // 그대로 저장할지 말지는 별개 관심사이고, 이 클래스의 계약은 "블랙(빈 문자열)이 아니면 그대로 반환"이다.
    assertThat(result).isEqualTo("패턴 없음");
  }

  @Test
  void returns_null_and_does_not_throw_when_the_model_call_fails() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(any(), any())).thenThrow(new RuntimeException("timeout"));

    String result = analyzer(true).analyze("SQLI_QUERY", List.of("a", "b", "c", "d", "e"));

    assertThat(result).isNull();
  }

  @Test
  void returns_null_when_the_reply_is_not_valid_json() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(any(), any())).thenReturn(
        new LlmGateway.LlmResult("openai", "gpt-4o-mini", "not json at all", 10, 10, 20, 5));

    String result = analyzer(true).analyze("SQLI_QUERY", List.of("a", "b", "c", "d", "e"));

    assertThat(result).isNull();
  }
}
