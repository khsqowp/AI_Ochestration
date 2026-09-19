package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** High #9 — 답안 검증 우회: null/공백 답안이 해시 계산 NPE(500)나 불필요한 유료 AI 채점
 * 호출로 이어지던 문제. {@link TrainingService#submit}/{@link TrainingService#evaluateExisting}
 * 둘 다 결국 {@code evaluateAttempt}를 거치므로 그 한 곳에서 막히는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class TrainingServiceTest {
  @Mock private CompetencyAssessmentRepository assessments;
  @Mock private TrainingCaseRepository cases;
  @Mock private TrainingAttemptRepository attempts;
  @Mock private TrainingEvaluationRepository evaluations;
  @Mock private TrainingEvaluationCacheRepository evaluationCache;
  @Mock private TrainingAiEvaluator evaluator;

  private TrainingService service() {
    return new TrainingService(assessments, cases, attempts, evaluations, evaluationCache, evaluator, new ObjectMapper());
  }

  private TrainingAttempt attemptOwnedBy(UUID ownerId) {
    TrainingCase trainingCase = new TrainingCase("case-v1", "제목", TrainingCaseType.STATIC_DIAGNOSIS, "API_SECURITY", 1, "prompt", "{}");
    return new TrainingAttempt(ownerId, trainingCase);
  }

  @Test
  void submit_rejects_null_answer_without_calling_the_evaluator() {
    UUID ownerId = UUID.randomUUID();
    UUID attemptId = UUID.randomUUID();
    when(attempts.findByIdAndOwnerId(attemptId, ownerId)).thenReturn(Optional.of(attemptOwnedBy(ownerId)));

    assertThatThrownBy(() -> service().submit(ownerId, attemptId, null))
        .isInstanceOf(IllegalArgumentException.class);
    verifyNoInteractions(evaluator);
  }

  @Test
  void submit_rejects_blank_answer_without_calling_the_evaluator() {
    UUID ownerId = UUID.randomUUID();
    UUID attemptId = UUID.randomUUID();
    when(attempts.findByIdAndOwnerId(attemptId, ownerId)).thenReturn(Optional.of(attemptOwnedBy(ownerId)));

    assertThatThrownBy(() -> service().submit(ownerId, attemptId, "   "))
        .isInstanceOf(IllegalArgumentException.class);
    verifyNoInteractions(evaluator);
  }

  @Test
  void evaluateExisting_rejects_an_attempt_whose_saved_answer_is_blank() {
    UUID ownerId = UUID.randomUUID();
    UUID attemptId = UUID.randomUUID();
    TrainingAttempt attempt = attemptOwnedBy(ownerId);
    attempt.saveAnswer("");
    when(attempts.findByIdAndOwnerId(attemptId, ownerId)).thenReturn(Optional.of(attempt));
    when(evaluations.findByAttemptId(attemptId)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service().evaluateExisting(ownerId, attemptId))
        .isInstanceOf(IllegalArgumentException.class);
    verifyNoInteractions(evaluator);
  }

  @Test
  void submit_still_evaluates_a_real_answer() throws Exception {
    UUID ownerId = UUID.randomUUID();
    UUID attemptId = UUID.randomUUID();
    when(attempts.findByIdAndOwnerId(attemptId, ownerId)).thenReturn(Optional.of(attemptOwnedBy(ownerId)));
    when(evaluator.cacheKey(any(), any())).thenReturn("cache-key");
    when(evaluator.answerHash(any())).thenReturn("hash");
    when(evaluationCache.findByCacheKey("cache-key")).thenReturn(Optional.empty());
    var providerResponse = new com.orchestration.tasks.LlmGateway.LlmResult("OPENAI", "gpt", "{}", 10, 5, 15, 100L);
    when(evaluator.evaluate(any(), any())).thenReturn(new TrainingAiEvaluator.EvaluationResult(providerResponse, 80, "{}", "잘했습니다"));
    when(evaluator.estimatedCost(providerResponse)).thenReturn(java.math.BigDecimal.ZERO);

    TrainingAttempt result = service().submit(ownerId, attemptId, "실제 답안입니다");

    assertThat(result.getScore()).isEqualTo(80.0);
  }
}
