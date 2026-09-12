package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TrainingCaseTest {
  @Test
  void refresh_replaces_the_full_published_case_definition() {
    TrainingCase trainingCase = new TrainingCase("cookie-case", "짧은 제목", TrainingCaseType.STATIC_DIAGNOSIS,
        "SESSION_COOKIE", 1, "짧은 상황", "{\"version\":\"v1\"}");

    trainingCase.refresh("상세 쿠키 관찰", TrainingCaseType.REPORT_REVIEW, "AUTHORIZATION", 3,
        "## 관측 자료\n요청과 응답", "{\"version\":\"v2\"}");

    assertThat(trainingCase.getTitle()).isEqualTo("상세 쿠키 관찰");
    assertThat(trainingCase.getCaseType()).isEqualTo(TrainingCaseType.REPORT_REVIEW);
    assertThat(trainingCase.getPrimarySkillCode()).isEqualTo("AUTHORIZATION");
    assertThat(trainingCase.getDifficulty()).isEqualTo(3);
    assertThat(trainingCase.getPromptMd()).contains("요청과 응답");
    assertThat(trainingCase.getRubricJson()).contains("v2");
  }
}
