package com.orchestration.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/** Signs and verifies the session JWT (HS256). The signing key comes from {@code JWT_SECRET}; when
 * {@code app.auth.enabled} is true a missing secret fails fast at startup rather than silently falling back
 * to a guessable default, since that default would otherwise let anyone forge an admin session. When
 * disabled (local dev, no real login), there's no configured secret to fall back to at all -- a previous
 * version used a hardcoded constant string here, which meant anyone who read this file (or the git history)
 * could forge a valid dev-session JWT. Generating a fresh random key per process instead keeps dev-mode
 * sessions working (this process signs and verifies its own tokens) without a guessable constant. */
@Component
class JwtService {
  static final long EXPIRY_DAYS = 7;

  private final SecretKey key;

  JwtService(AuthProperties properties) {
    String secret = properties.jwtSecret();
    if (properties.enabled() && (secret == null || secret.isBlank())) {
      throw new IllegalStateException("app.auth.enabled=true 로 설정하려면 JWT_SECRET 환경변수를 함께 설정해야 합니다.");
    }
    this.key = (secret == null || secret.isBlank()) ? randomKey() : Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  private static SecretKey randomKey() {
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    return Keys.hmacShaKeyFor(bytes);
  }

  String issue(UUID userId, String email, Role role, String jti) {
    Instant now = Instant.now();
    return Jwts.builder()
        .subject(userId.toString())
        .claim("email", email)
        .claim("role", role.name())
        .id(jti)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(EXPIRY_DAYS, ChronoUnit.DAYS)))
        .signWith(key)
        .compact();
  }

  Optional<Claims> parse(String token) {
    if (token == null || token.isBlank()) return Optional.empty();
    try {
      return Optional.of(Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload());
    } catch (JwtException | IllegalArgumentException exception) {
      return Optional.empty();
    }
  }
}
