package com.orchestration.dolphin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.auth.AuthService;
import com.orchestration.auth.Role;
import com.orchestration.tasks.LlmProperties;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class DolphinChatControllerTest {
  @Test
  void sessionlessChatStreamsAnswerWithoutOwnershipCheck() throws Exception {
    AuthService auth = mock(AuthService.class);
    DolphinChatService service = mock(DolphinChatService.class);
    LlmProperties properties = mock(LlmProperties.class);
    when(auth.validate("token")).thenReturn(Optional.of(new AuthService.UserProfile("owner", "user@example.test", "User", Role.ADMIN)));
    var input = List.of(new DolphinChatService.ChatInput("user", "질문"));
    when(service.answer("general", input)).thenReturn(new DolphinChatService.ChatAnswer("답변", List.of()));
    var controller = new DolphinChatController(auth, service, new ObjectMapper(), properties);
    var request = new DolphinChatController.ChatRequest(input, "general", null, null, null, null);

    var response = controller.chat("token", request);
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    response.getBody().writeTo(output);

    assertThat(output.toString(StandardCharsets.UTF_8)).contains("\"content\":\"답변\"").endsWith("data: [DONE]\n\n");
    verify(service).answer("general", input);
    verify(service, never()).requireOwned(anyString(), any());
    verify(service, never()).chat(anyString(), any(), anyString(), anyList());
  }

  @Test
  void modelsReportsConfiguredDolphinModel() {
    AuthService auth = mock(AuthService.class);
    when(auth.validate("token")).thenReturn(Optional.of(new AuthService.UserProfile("owner", "user@example.test", "User", Role.ADMIN)));
    LlmProperties properties = mock(LlmProperties.class);
    when(properties.bedrockDolphinModel()).thenReturn("haiku-model");
    var controller = new DolphinChatController(auth, mock(DolphinChatService.class), new ObjectMapper(), properties);

    assertThat(controller.models("token")).containsEntry("default", "haiku-model").containsEntry("models", List.of());
  }
}
