package com.orchestration.auth;

import io.jsonwebtoken.Claims;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private final AppUserRepository users;
  private final UserSessionRepository sessions;
  private final AuthProperties properties;
  private final JwtService jwt;
  private final PasswordEncoder encoder;
  private final SecureRandom random = new SecureRandom();

  AuthService(AppUserRepository users, UserSessionRepository sessions, AuthProperties properties, JwtService jwt, PasswordEncoder encoder) {
    this.users = users; this.sessions = sessions; this.properties = properties; this.jwt = jwt; this.encoder = encoder;
  }

  /** Local-dev convenience path: only reachable while {@code app.auth.enabled=false}. Auto-provisions a
   * single ADMIN account so the workspace opens without a login form during development. */
  @Transactional
  public SessionResult currentOrCreateDevSession(String cookieToken) {
    if (properties.enabled()) return null;
    if (cookieToken != null) {
      Optional<SessionResult> existing = validate(cookieToken).map(profile -> new SessionResult(cookieToken, profile, false));
      if (existing.isPresent()) return existing.get();
    }
    AppUser user = users.findByEmail(properties.devAdminEmail())
        .orElseGet(() -> users.save(new AppUser(properties.devAdminEmail(), properties.devAdminName(), Role.ADMIN)));
    return issueSession(user, true);
  }

  /** Real credential check, used once {@code app.auth.enabled=true}. Failure is intentionally
   * indistinguishable between "no such id" and "wrong password" — see {@link InvalidCredentialsException}. */
  @Transactional
  public SessionResult login(String loginId, String rawPassword) {
    AppUser user = users.findByEmail(loginId).orElseThrow(InvalidCredentialsException::new);
    if (user.getPasswordHash() == null || !encoder.matches(rawPassword, user.getPasswordHash())) throw new InvalidCredentialsException();
    return issueSession(user, true);
  }

  /** Verifies a session JWT's signature/expiry, then confirms its session row hasn't been revoked (logout)
   * — the DB check is what makes a stateless JWT actually revocable. */
  @Transactional(readOnly = true)
  public Optional<UserProfile> validate(String token) {
    Claims claims = jwt.parse(token).orElse(null);
    if (claims == null) return Optional.empty();
    return sessions.findByToken(claims.getId()).filter(UserSession::isActive).map(session -> UserProfile.from(session.getUser()));
  }

  @Transactional
  public void revoke(String token) {
    Claims claims = jwt.parse(token).orElse(null);
    if (claims == null) return;
    sessions.findByToken(claims.getId()).ifPresent(session -> { session.revoke(); sessions.save(session); });
  }

  private SessionResult issueSession(AppUser user, boolean created) {
    String jti = newJti();
    UserSession session = sessions.save(new UserSession(user, jti, Instant.now().plus(JwtService.EXPIRY_DAYS, ChronoUnit.DAYS)));
    String token = jwt.issue(user.getId(), user.getEmail(), user.getRole(), jti);
    return new SessionResult(token, UserProfile.from(session.getUser()), created);
  }

  private String newJti() { byte[] bytes = new byte[24]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }

  public record SessionResult(String token, UserProfile user, boolean created) {}
  public record UserProfile(String id, String email, String displayName, Role role) {
    static UserProfile from(AppUser user) { return new UserProfile(user.getId().toString(), user.getEmail(), user.getDisplayName(), user.getRole()); }
  }
}
