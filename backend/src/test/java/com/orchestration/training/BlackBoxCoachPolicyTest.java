package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class BlackBoxCoachPolicyTest {
  @Test
  void unknown_response_keeps_the_answer_hidden_and_asks_for_one_observable_check() {
    String reply = BlackBoxCoach.fallback("모르겠어", "아직 이 세션에서 실행된 요청이 없습니다.");

    assertThat(reply).doesNotContain("취약점은").doesNotContain("정답은");
    assertThat(reply).contains("확인");
  }

  @Test
  void parallel_success_response_is_not_labeled_as_a_race_before_effect_is_observed() {
    String reply = BlackBoxCoach.fallback("동시에 두 주문에 적용", "{\"requestCount\": 2,\"responses\":[{\"status\":200},{\"status\":200}]}");

    assertThat(reply).doesNotContain("레이스 컨디션").doesNotContain("취약점 확인");
    assertThat(reply).contains("재조회");
  }

  @Test
  void fallback_never_demands_a_report_template_or_fabricated_evidence() {
    String reply = BlackBoxCoach.fallback("다른 게 더 있나", "HTTP/1.1 200 OK");

    assertThat(reply).doesNotContain("1.").doesNotContain("2.").doesNotContain("양식");
    assertThat(reply).contains("확인");
  }

  @Test
  void rejects_model_text_that_leaks_a_diagnosis_or_demands_a_report_even_when_exact_old_blocked_words_are_absent() {
    assertThat(BlackBoxCoach.safeAxis("이는 동시 처리 결함이다. 무엇을 더 할까?")).isEmpty();
    assertThat(BlackBoxCoach.safeAxis("판정, 근거, 영향을 작성하세요.")).isEmpty();
    assertThat(BlackBoxCoach.safeAxis("{\"axis\":\"ACTUAL_EFFECT\"}")).contains("ACTUAL_EFFECT");
    assertThat(BlackBoxCoach.safeAxis("경쟁 상태 때문에 두 주문 할인 제한이 깨진 것인가?")).isEmpty();
  }
}
