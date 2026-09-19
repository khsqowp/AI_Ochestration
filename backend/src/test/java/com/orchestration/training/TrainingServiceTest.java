package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
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
  void start_rejects_an_unpublished_case() {
    // Medium #16 -- listCases()/recommendations() already filter to findByPublishedTrueOrderBy...(),
    // so an unpublished case never appears in the catalog, but start() took a raw caseId with no such
    // check: anyone who already had (or guessed) the UUID of a retired/draft case could still start it.
    UUID ownerId = UUID.randomUUID();
    TrainingCase unpublished = new TrainingCase("draft-case", "제목", TrainingCaseType.STATIC_DIAGNOSIS, "API_SECURITY", 1, "prompt", "{}");
    unpublished.unpublish();
    UUID caseId = UUID.randomUUID();
    when(cases.findById(caseId)).thenReturn(Optional.of(unpublished));

    assertThatThrownBy(() -> service().start(ownerId, caseId))
        .isInstanceOf(java.util.NoSuchElementException.class);
    verifyNoInteractions(attempts);
  }

  @Test
  void submit_still_evaluates_a_real_answer() throws Exception {
    UUID ownerId = UUID.randomUUID();
    UUID attemptId = UUID.randomUUID();
    when(attempts.findByIdAndOwnerId(attemptId, ownerId)).thenReturn(Optional.of(attemptOwnedBy(ownerId)));
    when(evaluator.cacheKey(any(), any(), any())).thenReturn("cache-key");
    when(evaluator.answerHash(any())).thenReturn("hash");
    when(evaluationCache.findByCacheKey("cache-key")).thenReturn(Optional.empty());
    var providerResponse = new com.orchestration.tasks.LlmGateway.LlmResult("OPENAI", "gpt", "{}", 10, 5, 15, 100L);
    when(evaluator.evaluate(any(), any(), any())).thenReturn(new TrainingAiEvaluator.EvaluationResult(providerResponse, 80, "{}", "잘했습니다"));
    when(evaluator.estimatedCost(providerResponse)).thenReturn(java.math.BigDecimal.ZERO);

    TrainingAttempt result = service().submit(ownerId, attemptId, "실제 답안입니다");

    assertThat(result.getScore()).isEqualTo(80.0);
  }

  @Test
  void submit_scoresAgainstThePromptAndRubricSnapshottedAtStart_notTheCasesLiveValuesAfterAnEdit() throws Exception {
    // High #8 -- TrainingAiEvaluator.cacheKey/evaluate used to be called with the live TrainingCase, so an
    // admin editing a case's prompt/rubric after a learner already started an attempt on it silently
    // changed how that in-flight attempt got scored.
    UUID ownerId = UUID.randomUUID();
    UUID attemptId = UUID.randomUUID();
    TrainingCase trainingCase = new TrainingCase("case-v1", "제목", TrainingCaseType.STATIC_DIAGNOSIS, "API_SECURITY", 1, "원본 문제", "{\"version\":\"v1\"}");
    TrainingAttempt attempt = new TrainingAttempt(ownerId, trainingCase);
    // Case gets edited by an admin AFTER the attempt already snapshotted the original prompt/rubric.
    trainingCase.refresh("제목", TrainingCaseType.STATIC_DIAGNOSIS, "API_SECURITY", 1, "수정된 문제", "{\"version\":\"v2\"}");
    when(attempts.findByIdAndOwnerId(attemptId, ownerId)).thenReturn(Optional.of(attempt));
    when(evaluator.cacheKey(any(), any(), any())).thenReturn("cache-key");
    when(evaluator.answerHash(any())).thenReturn("hash");
    when(evaluationCache.findByCacheKey("cache-key")).thenReturn(Optional.empty());
    var providerResponse = new com.orchestration.tasks.LlmGateway.LlmResult("OPENAI", "gpt", "{}", 10, 5, 15, 100L);
    when(evaluator.evaluate(any(), any(), any())).thenReturn(new TrainingAiEvaluator.EvaluationResult(providerResponse, 80, "{}", "잘했습니다"));
    when(evaluator.estimatedCost(providerResponse)).thenReturn(java.math.BigDecimal.ZERO);

    service().submit(ownerId, attemptId, "실제 답안입니다");

    verify(evaluator).cacheKey(trainingCase.getId(), "{\"version\":\"v1\"}", "실제 답안입니다");
    verify(evaluator).evaluate("원본 문제", "{\"version\":\"v1\"}", "실제 답안입니다");
  }

  @Test
  void recalculateAssessments_groupsAPastEvaluationBySkillSnapshottedAtItsAttemptStart_notTheCasesCurrentSkill() {
    // High #8 -- assessment rebuilding grouped completed evaluations by trainingCase.getPrimarySkillCode()
    // (live), so reclassifying a case to a different skill retroactively moved its already-scored history
    // out of the skill the learner actually practiced.
    UUID ownerId = UUID.randomUUID();
    TrainingCase historicalCase = new TrainingCase("case-v1", "제목", TrainingCaseType.STATIC_DIAGNOSIS, "API_SECURITY", 1, "문제", "{}");
    TrainingAttempt historicalAttempt = new TrainingAttempt(ownerId, historicalCase);
    historicalCase.refresh("제목", TrainingCaseType.STATIC_DIAGNOSIS, "AUTHORIZATION", 1, "문제", "{}");
    TrainingEvaluation historicalEvaluation = new TrainingEvaluation(historicalAttempt, "OPENAI", "gpt", "v1", "hash",
        TrainingEvaluationStatus.COMPLETED, "{\"score\":80}", null, 10, 5, 15, 100L, java.math.BigDecimal.ZERO);
    when(evaluations.findCompletedForOwner(ownerId, TrainingEvaluationStatus.COMPLETED)).thenReturn(List.of(historicalEvaluation));
    CompetencyAssessment apiSecurity = new CompetencyAssessment(ownerId, "API_SECURITY", 50.0, AssessmentConfidence.LOW, "초기", 0);
    when(assessments.findByOwnerIdOrderBySkillCode(ownerId)).thenReturn(List.of(apiSecurity));
    // Trigger recalculateAssessments through the evaluateExisting() cache-hit path on an unrelated attempt.
    UUID currentAttemptId = UUID.randomUUID();
    TrainingAttempt currentAttempt = attemptOwnedBy(ownerId);
    currentAttempt.saveAnswer("현재 답안");
    when(attempts.findByIdAndOwnerId(currentAttemptId, ownerId)).thenReturn(Optional.of(currentAttempt));
    when(evaluations.findByAttemptId(currentAttemptId)).thenReturn(Optional.empty());
    when(evaluator.cacheKey(any(), any(), any())).thenReturn("cache-key");
    when(evaluator.answerHash(any())).thenReturn("hash");
    when(evaluationCache.findByCacheKey("cache-key")).thenReturn(Optional.of(
        new TrainingEvaluationCache("cache-key", "OPENAI", "gpt", "{}", 90, "잘했습니다", 10, 5, 15, 100L, java.math.BigDecimal.ZERO)));

    service().evaluateExisting(ownerId, currentAttemptId);

    // If the bug were still present, the historical evaluation would be grouped under "AUTHORIZATION"
    // (the case's post-edit skill), leaving apiSecurity's rows empty and evaluationCount at 0.
    assertThat(apiSecurity.getEvaluationCount()).isEqualTo(1);
  }
}
