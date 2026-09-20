package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class BlackBoxAiSessionTest {
  @Test
  void createsAnAiGeneratedSessionWithoutBorrowingACatalogScenario() {
    BlackBoxScenarioSession session=BlackBoxScenarioSession.startAi(
        UUID.randomUUID(), "AUTHORIZATION", "AI가 만든 사건", "공개된 사건 설명", "{\"hidden\":true}", "첫 대화");

    assertThat(session.isAiGenerated()).isTrue();
    assertThat(session.getScenarioSlug()).startsWith("ai-");
    assertThat(session.getScenarioTitle()).isEqualTo("AI가 만든 사건");
    assertThat(session.getMessages()).containsExactly("COACH::첫 대화");
  }
}
