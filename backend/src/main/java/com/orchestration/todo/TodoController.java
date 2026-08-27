package com.orchestration.todo;

import com.orchestration.auth.AuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Same session cookie the rest of the app uses; read directly (not via Spring Security's principal)
 * because {@link com.orchestration.auth.JwtAuthenticationFilter} is only registered when
 * {@code app.auth.enabled}, but the widget also has to work in the no-auth local-dev mode. */
@RestController
@RequestMapping("/api/todos")
public class TodoController {
  private static final String COOKIE = "orchestration_session";
  private final TodoService todos;
  private final AuthService auth;

  TodoController(TodoService todos, AuthService auth) { this.todos = todos; this.auth = auth; }

  @GetMapping
  public List<Response> list(@CookieValue(value = COOKIE, required = false) String token) {
    return todos.list(ownerId(token)).stream().map(Response::from).toList();
  }

  @PostMapping
  public Response add(@CookieValue(value = COOKIE, required = false) String token, @Valid @RequestBody Request request) {
    return Response.from(todos.add(ownerId(token), request.text()));
  }

  @PatchMapping("/{id}")
  public Response setCompleted(@CookieValue(value = COOKIE, required = false) String token, @PathVariable UUID id, @RequestBody ToggleRequest request) {
    return Response.from(todos.setCompleted(ownerId(token), id, request.completed()));
  }

  private UUID ownerId(String token) {
    return auth.validate(token).map(profile -> UUID.fromString(profile.id()))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }

  record Request(@NotBlank @Size(max = 2000) String text) {}

  record ToggleRequest(boolean completed) {}

  record Response(String id, String text, boolean completed, Instant createdAt, Instant completedAt) {
    static Response from(TodoItem item) {
      return new Response(item.getId().toString(), item.getText(), item.isCompleted(), item.getCreatedAt(), item.getCompletedAt());
    }
  }
}
