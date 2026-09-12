package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TrainingAttemptTest {
  @Test
  void captures_case_title_and_prompt_when_an_attempt_starts() {
    TrainingCase trainingCase = new TrainingCase("case-v1", "첫 문제 제목", TrainingCaseType.STATIC_DIAGNOSIS,
        "API_SECURITY", 2, "## 관측 자료\n첫 문제 본문", "{\"version\":\"v1\"}");

    TrainingAttempt attempt = new TrainingAttempt(java.util.UUID.randomUUID(), trainingCase);
    trainingCase.refresh("바뀐 문제 제목", TrainingCaseType.REPORT_REVIEW, "API_SECURITY", 3,
        "## 관측 자료\n바뀐 문제 본문", "{\"version\":\"v2\"}");

    assertThat(attempt.getCaseTitleSnapshot()).isEqualTo("첫 문제 제목");
    assertThat(attempt.getCasePromptSnapshot()).contains("첫 문제 본문");
  }
}
