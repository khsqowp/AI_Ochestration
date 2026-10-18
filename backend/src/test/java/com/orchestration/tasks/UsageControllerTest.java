package com.orchestration.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class UsageControllerTest {
  @Mock private TaskEventRepository events;
  @Mock private LlmProperties llm;

  @Test
  void storedGeminiCostWinsAndOnlyLegacyRowsUseCurrentRates() {
    TaskEvent discounted = new TaskEvent(UUID.randomUUID(), "COLLECT", "batch", new LlmGateway.LlmResult("Gemini", "gemini-2.5-flash", "", 1_000_000, 0, 1_000_000, 1L), new BigDecimal("0.50"));
    TaskEvent legacy = new TaskEvent(UUID.randomUUID(), "COLLECT", "old", new LlmGateway.LlmResult("Gemini", "gemini-2.5-flash", "", 1_000_000, 0, 1_000_000, 1L), null);
    when(events.findByCreatedAtGreaterThanEqualAndTotalTokensIsNotNull(any())).thenReturn(List.of(discounted, legacy));
    when(llm.geminiInputUsdPerMillion()).thenReturn(BigDecimal.ONE);
    when(llm.geminiOutputUsdPerMillion()).thenReturn(BigDecimal.ONE);

    UsageController.UsageSummary summary = new UsageController(events, llm, new BigDecimal("20")).summary(30);

    assertThat(summary.models().get(0).estimatedCostUsd()).isEqualByComparingTo("1.50");
    assertThat(summary.total().estimatedCostUsd()).isEqualByComparingTo("1.50");
  }
}
