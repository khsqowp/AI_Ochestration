package com.orchestration.dolphin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.tasks.LlmGateway;
import com.orchestration.tasks.LlmProperties;
import com.orchestration.tasks.TaskService;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class DolphinChatServiceTest {
  private DolphinSessionRepository sessions;
  private DolphinMessageRepository messages;
  private DolphinChatService service;
  private DolphinTurnPersistence persistence;
  private LlmGateway llm;
  private final UUID id = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    sessions = mock(DolphinSessionRepository.class);
    messages = mock(DolphinMessageRepository.class);
    llm = mock(LlmGateway.class);
    LlmProperties properties = mock(LlmProperties.class);
    when(properties.bedrockDolphinModel()).thenReturn("haiku-model");
    persistence = mock(DolphinTurnPersistence.class);
    service = new DolphinChatService(sessions, messages, null, llm, properties, null, new ObjectMapper(), persistence, mock(TaskService.class));
  }

  @Test
  void ownerCanReadAndDeleteOwnSession() {
    DolphinSession session = mock(DolphinSession.class);
    when(session.getOwnerId()).thenReturn("owner");
    when(sessions.findById(id)).thenReturn(Optional.of(session));
    when(messages.findBySessionIdOrderByPositionAsc(id)).thenReturn(List.of());

    assertThat((List<?>) service.get("owner", id).get("messages")).isEmpty();
    service.delete("owner", id);
    verify(messages).deleteBySessionId(id);
    verify(sessions).deleteById(id);
  }

  @Test
  void otherUserCannotReadOrDeleteSession() {
    DolphinSession session = mock(DolphinSession.class);
    when(session.getOwnerId()).thenReturn("owner");
    when(sessions.findById(id)).thenReturn(Optional.of(session));

    assertThatThrownBy(() -> service.get("stranger", id)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
    assertThatThrownBy(() -> service.delete("stranger", id)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
    verifyNoInteractions(messages);
    verify(sessions, never()).deleteById(id);
  }

  @Test
  void nonexistentSessionReturnsNotFound() {
    when(sessions.findById(id)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.get("owner", id)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
    assertThatThrownBy(() -> service.delete("owner", id)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
  }

  @Test
  void ephemeralAnswerUsesConversationTurnsWithoutReadingOrSavingSessions() throws Exception {
    when(llm.decideWithBedrock(anyString(), anyList(), eq(8000), eq("haiku-model")))
        .thenReturn(new LlmGateway.LlmResult("Bedrock", "haiku-model", "답변", 1, 1, 2, 1));

    var answer = service.answer("general", List.of(
        new DolphinChatService.ChatInput("user", "첫 질문"),
        new DolphinChatService.ChatInput("assistant", "첫 답변"),
        new DolphinChatService.ChatInput("user", "다음 질문")));

    assertThat(answer.content()).isEqualTo("답변");
    ArgumentCaptor<List<LlmGateway.Turn>> turns = ArgumentCaptor.forClass(List.class);
    verify(llm).decideWithBedrock(anyString(), turns.capture(), eq(8000), eq("haiku-model"));
    assertThat(turns.getValue()).containsExactly(
        new LlmGateway.Turn("user", "첫 질문"),
        new LlmGateway.Turn("assistant", "첫 답변"),
        new LlmGateway.Turn("user", "다음 질문"));
    verifyNoInteractions(sessions, messages, persistence);
  }

  @Test
  void sessionChatSendsStoredTurnsAndDelegatesPersistence() throws Exception {
    DolphinSession session = mock(DolphinSession.class);
    when(session.getOwnerId()).thenReturn("owner");
    when(sessions.findById(id)).thenReturn(Optional.of(session));
    when(messages.findBySessionIdOrderByPositionAsc(id)).thenReturn(List.of(
        new DolphinMessage(id, 0, "user", "지난 질문", null),
        new DolphinMessage(id, 1, "assistant", "지난 답변", null)));
    when(llm.decideWithBedrock(anyString(), anyList(), eq(8000), eq("haiku-model")))
        .thenReturn(new LlmGateway.LlmResult("Bedrock", "haiku-model", "새 답변", 1, 1, 2, 1));

    var answer = service.chat("owner", id, "general", List.of(new DolphinChatService.ChatInput("user", "새 질문")));

    assertThat(answer.content()).isEqualTo("새 답변");
    ArgumentCaptor<List<LlmGateway.Turn>> turns = ArgumentCaptor.forClass(List.class);
    verify(llm).decideWithBedrock(anyString(), turns.capture(), eq(8000), eq("haiku-model"));
    assertThat(turns.getValue()).containsExactly(
        new LlmGateway.Turn("user", "지난 질문"),
        new LlmGateway.Turn("assistant", "지난 답변"),
        new LlmGateway.Turn("user", "새 질문"));
    verify(persistence).persistTurn("owner", id, "general", "새 질문", "새 답변", null);
    verify(messages, never()).save(any());
  }

  @Test
  void longHistoryDropsOldestTurnsAndPreservesLatestQuestion() throws Exception {
    when(llm.decideWithBedrock(anyString(), anyList(), eq(8000), eq("haiku-model")))
        .thenReturn(new LlmGateway.LlmResult("Bedrock", "haiku-model", "답변", 1, 1, 2, 1));
    String old = "오래된 내용 ".repeat(5000);
    String recent = "최근 질문 ".repeat(1000);

    service.answer("general", List.of(
        new DolphinChatService.ChatInput("user", old),
        new DolphinChatService.ChatInput("assistant", "최근 답변"),
        new DolphinChatService.ChatInput("user", recent),
        new DolphinChatService.ChatInput("assistant", "새 답변"),
        new DolphinChatService.ChatInput("user", "최종 질문")));

    ArgumentCaptor<List<LlmGateway.Turn>> turns = ArgumentCaptor.forClass(List.class);
    verify(llm).decideWithBedrock(anyString(), turns.capture(), eq(8000), eq("haiku-model"));
    assertThat(turns.getValue()).extracting(LlmGateway.Turn::role).startsWith("user").endsWith("user");
    assertThat(turns.getValue().get(turns.getValue().size() - 1).content()).isEqualTo("최종 질문");
    assertThat(turns.getValue().get(0).content().length()).isLessThan(old.length());
    assertThat(turns.getValue().stream().mapToInt(turn -> turn.content().length()).sum()).isLessThanOrEqualTo(35000);
  }

  @Test
  void turnPersistenceLocksSessionBeforeCountingAndWritingPositions() {
    DolphinTurnPersistence writer = new DolphinTurnPersistence(sessions, messages);
    DolphinSession session = mock(DolphinSession.class);
    when(session.getOwnerId()).thenReturn("owner");
    when(sessions.findByIdForUpdate(id)).thenReturn(Optional.of(session));
    when(messages.countBySessionId(id)).thenReturn(4L);

    writer.persistTurn("owner", id, "general", "질문", "답변", null);

    ArgumentCaptor<DolphinMessage> saved = ArgumentCaptor.forClass(DolphinMessage.class);
    verify(messages, times(2)).save(saved.capture());
    assertThat(saved.getAllValues()).extracting(DolphinMessage::getPosition).containsExactly(4, 5);
    var order = inOrder(sessions, messages);
    order.verify(sessions).findByIdForUpdate(id);
    order.verify(messages).countBySessionId(id);
    order.verify(messages, times(2)).save(any(DolphinMessage.class));
    order.verify(sessions).save(session);
  }
}
