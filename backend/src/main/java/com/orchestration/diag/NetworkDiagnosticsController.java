package com.orchestration.diag;

import com.orchestration.auth.AuthService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/diag/network-diagnose")
class NetworkDiagnosticsController {
  private static final String SESSION_COOKIE = "orchestration_session";
  private final NetworkDiagnosticsService service;
  private final AuthService auth;
  NetworkDiagnosticsController(NetworkDiagnosticsService service, AuthService auth) { this.service = service; this.auth = auth; }

  /** Anonymous callers (none in practice; SecurityConfig requires login) get a diagnosis without history persistence. */
  @PostMapping
  NetworkDiagnosticsService.Response diagnose(@RequestBody NetworkDiagnosticsService.Request request,
      @AuthenticationPrincipal AuthService.UserProfile principal,
      @CookieValue(value = SESSION_COOKIE, required = false) String token) throws Exception {
    UUID userId = currentUserId(principal, token);
    return userId == null ? service.diagnose(request) : service.diagnoseAndPersist(request, userId);
  }

  @GetMapping("/history")
  List<NetworkDiagnosticsService.RunSummary> history(@AuthenticationPrincipal AuthService.UserProfile principal,
      @CookieValue(value = SESSION_COOKIE, required = false) String token) {
    return service.history(requireUser(currentUser(principal, token)));
  }

  @GetMapping("/history/{id}")
  NetworkDiagnosticsService.RunDetail detail(@PathVariable UUID id,
      @AuthenticationPrincipal AuthService.UserProfile principal,
      @CookieValue(value = SESSION_COOKIE, required = false) String token) {
    return service.detail(id, requireUser(currentUser(principal, token)));
  }

  @PostMapping("/history/{id}/rerun")
  NetworkDiagnosticsService.Response rerun(@PathVariable UUID id,
      @AuthenticationPrincipal AuthService.UserProfile principal,
      @CookieValue(value = SESSION_COOKIE, required = false) String token) throws Exception {
    return service.rerun(id, requireUser(currentUser(principal, token)));
  }

  private UUID currentUserId(AuthService.UserProfile principal, String token) {
    AuthService.UserProfile user = currentUser(principal, token);
    return user == null ? null : UUID.fromString(user.id());
  }
  private AuthService.UserProfile currentUser(AuthService.UserProfile principal, String token) {
    if (principal != null) return principal;
    return auth.validate(token).orElse(null);
  }
  private UUID requireUser(AuthService.UserProfile user) {
    if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "인증이 필요합니다.");
    return UUID.fromString(user.id());
  }
}
