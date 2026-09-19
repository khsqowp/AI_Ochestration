package com.orchestration.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
    boolean enabled,
    boolean cookieSecure,
    String devAdminEmail,
    String devAdminName,
    String adminId,
    String adminPassword,
    String jwtSecret,
    String allowedOrigins) {
  // High #3 -- with auth enabled, the session cookie carries a JWT; without Secure it would be sent over
  // plain HTTP too, letting it leak to any on-path observer. Fail application boot outright rather than
  // silently deploy that combination (auth disabled never issues a cookie, so it's exempt).
  public AuthProperties {
    if (enabled && !cookieSecure) {
      throw new IllegalStateException(
          "app.auth.enabled=true인데 app.auth.cookie-secure=false입니다. AUTH_COOKIE_SECURE=true로 설정하세요(HTTPS 뒤에서만 인증을 켜세요).");
    }
  }
}

