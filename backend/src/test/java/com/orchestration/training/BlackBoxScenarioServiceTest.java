package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** High #7 -- the learner's own message must survive an AI outage, not disappear along with the failed
 * reply it was supposed to receive. */
@ExtendWith(MockitoExtension.class)
class BlackBoxScenarioServiceTest {
  @Mock private BlackBoxScenarioSessionRepository sessions;
  @Mock private CompetencyAssessmentRepository assessments;
  @Mock private BlackBoxScenarioIntentResolver intents;
  @Mock private BlackBoxCoach coach;
  @Mock private BlackBoxConclusionEvaluator conclusionEvaluator;
  @Mock private BlackBoxCompletionJudge completionJudge;
  @Mock private BlackBoxAiSessionService aiSessions;

  private BlackBoxScenarioService service() {
    return new BlackBoxScenarioService(sessions, assessments, intents, coach, conclusionEvaluator, completionJudge, aiSessions);
  }

  @Test
  void message_keepsTheLearnersMessage_whenTheAiReplyCallFails() {
    UUID ownerId = UUID.randomUUID();
    UUID sessionId = UUID.randomUUID();
    BlackBoxScenarioSession session = BlackBoxScenarioSession.startAi(ownerId, "API_SECURITY", "제목", "공개 개요", "{}", "첫 메시지");
    when(sessions.findByIdAndOwnerId(sessionId, ownerId)).thenReturn(Optional.of(session));
    when(aiSessions.reply(any(), any())).thenThrow(new IllegalStateException("훈련 AI 호출에 실패했습니다. 새 사건은 생성하지 않았습니다."));
    when(sessions.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

    BlackBoxScenarioSession result = service().message(ownerId, sessionId, "여기 취약점이 있나요?");

    assertThat(result.getMessages()).anyMatch(entry -> entry.equals("USER::여기 취약점이 있나요?"));
    assertThat(result.getStatus()).isEqualTo(BlackBoxSessionStatus.ACTIVE);
    verify(sessions).save(session);
  }

  @Test
  void message_stillWorksNormally_whenTheAiReplySucceeds() {
    UUID ownerId = UUID.randomUUID();
    UUID sessionId = UUID.randomUUID();
    BlackBoxScenarioSession session = BlackBoxScenarioSession.startAi(ownerId, "API_SECURITY", "제목", "공개 개요", "{}", "첫 메시지");
    when(sessions.findByIdAndOwnerId(sessionId, ownerId)).thenReturn(Optional.of(session));
    when(aiSessions.reply(any(), any())).thenReturn(new BlackBoxAiSessionService.Reply("정상 답변", "{}", false, ""));
    when(sessions.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

    BlackBoxScenarioSession result = service().message(ownerId, sessionId, "질문");

    assertThat(result.getMessages()).anyMatch(entry -> entry.equals("USER::질문"));
    assertThat(result.getMessages()).anyMatch(entry -> entry.equals("COACH::정상 답변"));
  }
}
