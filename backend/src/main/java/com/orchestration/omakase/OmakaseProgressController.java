package com.orchestration.omakase;

import com.orchestration.auth.AuthService;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** TodoController와 동일한 세션 쿠키 직접 조회 패턴 -- app.auth.enabled=false인 로컬 개발 모드에서도
 * 동작해야 해서 Spring Security principal이 아니라 쿠키를 직접 읽는다. */
@RestController
@RequestMapping("/api/omakase/progress")
public class OmakaseProgressController {
  private static final String COOKIE = "orchestration_session";
  private final OmakaseProgressService progress;
  private final AuthService auth;

  OmakaseProgressController(OmakaseProgressService progress, AuthService auth) {
    this.progress = progress;
    this.auth = auth;
  }

  @GetMapping
  public List<Response> list(@CookieValue(value = COOKIE, required = false) String token) {
    return progress.list(ownerId(token)).stream().map(Response::from).toList();
  }

  @PutMapping("/{topicId}")
  public Response save(
      @CookieValue(value = COOKIE, required = false) String token,
      @PathVariable String topicId,
      @jakarta.validation.Valid @RequestBody Request request) {
    return Response.from(progress.save(ownerId(token), topicId, request.fileId(), request.scrollFraction()));
  }

  private UUID ownerId(String token) {
    return auth.validate(token).map(profile -> UUID.fromString(profile.id()))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  }

  record Request(@NotBlank String fileId, double scrollFraction) {}

  record Response(String topicId, String fileId, double scrollFraction, Instant updatedAt) {
    static Response from(OmakaseProgress p) {
      return new Response(p.getTopicId(), p.getFileId(), p.getScrollFraction(), p.getUpdatedAt());
    }
  }
}
