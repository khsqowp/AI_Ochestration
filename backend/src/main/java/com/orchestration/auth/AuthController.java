package com.orchestration.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private static final String COOKIE = "orchestration_session";
  private static final long COOKIE_MAX_AGE_SECONDS = JwtService.EXPIRY_DAYS * 24 * 3600;
  private final AuthService service;
  private final AuthProperties properties;

  AuthController(AuthService service, AuthProperties properties) { this.service = service; this.properties = properties; }

  @GetMapping("/session")
  public ResponseEntity<AuthStatus> session(@CookieValue(value = COOKIE, required = false) String token) {
    // currentOrCreateDevSession is a local-dev-only path (see its own doc comment) that always returns
    // null once real auth is enabled -- so a real, still-valid session cookie must be revalidated here
    // directly, or every page load would 401 and force a fresh login regardless of cookie validity.
    if (properties.enabled()) {
      return service.validate(token)
          .map(user -> ResponseEntity.ok(new AuthStatus(true, user)))
          .orElseGet(() -> ResponseEntity.status(401).body(new AuthStatus(true, null)));
    }
    var result = service.currentOrCreateDevSession(token);
    if (result == null) return ResponseEntity.status(401).body(new AuthStatus(true, null));
    if (!result.created()) return ResponseEntity.ok(new AuthStatus(false, result.user()));
    return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie(result.token(), COOKIE_MAX_AGE_SECONDS).toString())
        .body(new AuthStatus(false, result.user()));
  }

  @PostMapping("/login")
  public ResponseEntity<AuthStatus> login(@Valid @RequestBody LoginRequest request) {
    var result = service.login(request.id(), request.password());
    return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie(result.token(), COOKIE_MAX_AGE_SECONDS).toString())
        .body(new AuthStatus(properties.enabled(), result.user()));
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout(@CookieValue(value = COOKIE, required = false) String token) {
    service.revoke(token);
    return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", 0).toString()).build();
  }

  private ResponseCookie cookie(String value, long maxAge) {
    return ResponseCookie.from(COOKIE, value).httpOnly(true).secure(properties.cookieSecure()).sameSite("Lax").path("/").maxAge(maxAge).build();
  }
  record AuthStatus(boolean authenticationEnabled, AuthService.UserProfile user) {}
  record LoginRequest(@NotBlank @Size(max = 320) String id, @NotBlank @Size(max = 200) String password) {}
}
