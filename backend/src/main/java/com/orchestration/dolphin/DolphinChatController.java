package com.orchestration.dolphin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.auth.AuthService;
import com.orchestration.tasks.LlmProperties;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/dolphin")
public class DolphinChatController {
  private static final Logger log = LoggerFactory.getLogger(DolphinChatController.class);
  private static final String COOKIE = "orchestration_session";
  private final AuthService auth;
  private final DolphinChatService chat;
  private final ObjectMapper json;
  private final LlmProperties properties;

  public DolphinChatController(AuthService auth, DolphinChatService chat, ObjectMapper json, LlmProperties properties) {
    this.auth = auth; this.chat = chat; this.json = json; this.properties = properties;
  }

  @GetMapping("/models")
  public Map<String, Object> models(@CookieValue(value = COOKIE, required = false) String token) {
    profile(token);
    return Map.of("models", List.of(), "default", properties.bedrockDolphinModel());
  }

  @GetMapping("/sessions")
  public Map<String, Object> sessions(@CookieValue(value = COOKIE, required = false) String token) {
    return Map.of("sessions", chat.list(profile(token).id()));
  }

  @PostMapping("/sessions")
  public Map<String, Object> create(@CookieValue(value = COOKIE, required = false) String token,
      @RequestBody CreateRequest request) {
    return chat.create(profile(token).id(), request.mode());
  }

  @GetMapping("/sessions/{id}")
  public Map<String, Object> session(@CookieValue(value = COOKIE, required = false) String token,
      @PathVariable UUID id) {
    return chat.get(profile(token).id(), id);
  }

  @DeleteMapping("/sessions/{id}")
  public ResponseEntity<Void> delete(@CookieValue(value = COOKIE, required = false) String token,
      @PathVariable UUID id) {
    chat.delete(profile(token).id(), id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/sessions/{id}/export")
  public Map<String, String> export(@CookieValue(value = COOKIE, required = false) String token,
      @PathVariable UUID id) throws IOException {
    return Map.of("file", chat.export(profile(token).id(), id));
  }

  @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public ResponseEntity<StreamingResponseBody> chat(@CookieValue(value = COOKIE, required = false) String token,
      @RequestBody ChatRequest request) {
    String ownerId = profile(token).id();
    if (request.session_id() != null) chat.requireOwned(ownerId, request.session_id());
    StreamingResponseBody stream = out -> {
      try {
        DolphinChatService.ChatAnswer answer = request.session_id() == null
            ? chat.answer(request.mode(), request.messages())
            : chat.chat(ownerId, request.session_id(), request.mode(), request.messages());
        write(out, Map.of("content", answer.content()));
        if (!answer.sources().isEmpty()) write(out, Map.of("sources", answer.sources()));
      } catch (Exception exception) {
        log.warn("dolphin_chat_failed session={}", request.session_id(), exception);
        try { write(out, Map.of("error", "채팅 응답에 실패했습니다. 잠시 후 다시 시도하세요.")); }
        catch (IOException disconnected) { log.debug("dolphin_client_disconnected", disconnected); }
      } finally {
        try { out.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8)); out.flush(); }
        catch (IOException disconnected) { log.debug("dolphin_client_disconnected", disconnected); }
      }
    };
    return ResponseEntity.ok().header("X-Accel-Buffering", "no").header("Cache-Control", "no-cache")
        .contentType(MediaType.TEXT_EVENT_STREAM).body(stream);
  }

  private void write(OutputStream out, Object payload) throws IOException {
    out.write(("data: " + json.writeValueAsString(payload) + "\n\n").getBytes(StandardCharsets.UTF_8));
    out.flush();
  }

  private AuthService.UserProfile profile(String token) {
    return auth.validate(token).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }

  public record CreateRequest(String mode) {}
  public record ChatRequest(List<DolphinChatService.ChatInput> messages, String mode,
      Double temperature, Integer num_ctx, String model, UUID session_id) {}
}
