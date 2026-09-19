package com.orchestration.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * High #2, CSRF defense-in-depth. The primary defense is already the session cookie's {@code SameSite=Lax}
 * attribute (blocks the classic cross-site form/fetch POST from ever carrying the cookie) plus every
 * mutating endpoint already requiring a non-GET method -- this is a second, independent layer in case
 * either of those is ever weakened (a browser bug, a future {@code SameSite=None} requirement, a
 * non-browser client that doesn't honor SameSite at all).
 *
 * <p>Only state-changing methods are checked, and only when an {@code Origin} header is actually present --
 * many legitimate requests (simple navigations, non-browser API clients, older browsers) omit it, and
 * rejecting those outright would be the sole defense turning into an availability bug. A present Origin
 * that matches the request's own scheme+host+port is always same-origin and allowed; anything else must be
 * explicitly listed in {@code app.auth.allowed-origins} (e.g. a separate frontend domain).
 */
class OriginValidationFilter extends OncePerRequestFilter {
  private static final Set<String> STATE_CHANGING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
  private final Set<String> allowedOrigins;

  OriginValidationFilter(AuthProperties properties) { this.allowedOrigins = parseAllowedOrigins(properties.allowedOrigins()); }

  static Set<String> parseAllowedOrigins(String raw) {
    if (raw == null || raw.isBlank()) return Set.of();
    return Arrays.stream(raw.split(",")).map(String::trim).filter(value -> !value.isBlank()).collect(Collectors.toUnmodifiableSet());
  }

  /** Package-visible, pure decision logic -- deliberately takes plain strings rather than a
   * {@link HttpServletRequest} so tests can exercise every case directly with no servlet API mocking. */
  boolean isRejected(String method, String origin, String selfOrigin) {
    if (!STATE_CHANGING_METHODS.contains(method.toUpperCase(Locale.ROOT))) return false;
    if (origin == null || origin.isBlank()) return false;
    if (origin.equalsIgnoreCase(selfOrigin)) return false;
    return !allowedOrigins.contains(origin);
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
    String selfOrigin = selfOrigin(request);
    if (isRejected(request.getMethod(), request.getHeader("Origin"), selfOrigin)) {
      response.setStatus(HttpServletResponse.SC_FORBIDDEN);
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);
      response.setCharacterEncoding("UTF-8");
      response.getWriter().write("{\"message\":\"허용되지 않은 출처의 요청입니다.\"}");
      return;
    }
    chain.doFilter(request, response);
  }

  private String selfOrigin(HttpServletRequest request) {
    boolean defaultPort = ("http".equals(request.getScheme()) && request.getServerPort() == 80)
        || ("https".equals(request.getScheme()) && request.getServerPort() == 443);
    return request.getScheme() + "://" + request.getServerName() + (defaultPort ? "" : ":" + request.getServerPort());
  }
}
