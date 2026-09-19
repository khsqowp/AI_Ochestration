package com.orchestration.training;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.tasks.LlmGateway;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** Medium #12 -- when the AI decides a session is done (shouldClose=true) but returns a blank or missing
 * closeSummary, {@link BlackBoxScenarioService#messageAi} persists that straight into finalReport via
 * {@link BlackBoxScenarioSession#closeAi}, leaving the learner's completed diagnosis with an empty report. */
@ExtendWith(MockitoExtension.class)
class BlackBoxAiSessionServiceTest {
  @Mock private LlmGateway llm;

  private BlackBoxAiSessionService service() {
    return new BlackBoxAiSessionService(llm, new ObjectMapper(), "OPENAI");
  }

  private BlackBoxScenarioSession activeSession() {
    return BlackBoxScenarioSession.startAi(UUID.randomUUID(), "API_SECURITY", "제목", "공개 개요", "{}", "첫 메시지");
  }

  @Test
  void reply_fallsBackToTheReplyText_whenAiClosesWithABlankCloseSummary() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
        .thenReturn(new LlmGateway.LlmResult("OPENAI", "gpt", "{\"reply\":\"관측을 종합하면 인가 누락이 확인됩니다.\",\"privateState\":\"{}\",\"shouldClose\":true,\"closeSummary\":\"\"}", 10, 5, 15, 100L));

    BlackBoxAiSessionService.Reply reply = service().reply(activeSession(), "그럼 결론이 뭐야?");

    assertThat(reply.shouldClose()).isTrue();
    assertThat(reply.closeSummary()).isNotBlank();
    assertThat(reply.closeSummary()).contains("인가 누락");
  }

  @Test
  void reply_fallsBackToTheReplyText_whenAiClosesWithoutACloseSummaryFieldAtAll() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
        .thenReturn(new LlmGateway.LlmResult("OPENAI", "gpt", "{\"reply\":\"최종 판단: 객체 인가 취약점입니다.\",\"privateState\":\"{}\",\"shouldClose\":true}", 10, 5, 15, 100L));

    BlackBoxAiSessionService.Reply reply = service().reply(activeSession(), "정리해줘");

    assertThat(reply.closeSummary()).isNotBlank();
  }

  @Test
  void reply_keepsTheAisOwnCloseSummary_whenItActuallyProvidesOne() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
        .thenReturn(new LlmGateway.LlmResult("OPENAI", "gpt", "{\"reply\":\"답변\",\"privateState\":\"{}\",\"shouldClose\":true,\"closeSummary\":\"인가 누락으로 최종 확인\"}", 10, 5, 15, 100L));

    BlackBoxAiSessionService.Reply reply = service().reply(activeSession(), "정리해줘");

    assertThat(reply.closeSummary()).isEqualTo("인가 누락으로 최종 확인");
  }

  @Test
  void reply_leavesCloseSummaryBlank_whenTheSessionIsNotClosing() throws Exception {
    when(llm.evaluateTrainingWithOpenAi(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
        .thenReturn(new LlmGateway.LlmResult("OPENAI", "gpt", "{\"reply\":\"조금 더 조사해보세요.\",\"privateState\":\"{}\",\"shouldClose\":false}", 10, 5, 15, 100L));

    BlackBoxAiSessionService.Reply reply = service().reply(activeSession(), "힌트 줘");

    assertThat(reply.shouldClose()).isFalse();
    assertThat(reply.closeSummary()).isBlank();
  }
}
