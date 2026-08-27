package com.orchestration.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Reads the session cookie once per request and, if it holds a valid, non-revoked JWT, populates the
 * Spring Security context so downstream {@code authorizeHttpRequests}/{@code @PreAuthorize} rules can see an
 * authenticated principal with a {@code ROLE_*} authority. Only registered when {@code app.auth.enabled}. */
class JwtAuthenticationFilter extends OncePerRequestFilter {
  private static final String COOKIE = "orchestration_session";
  private final AuthService auth;

  JwtAuthenticationFilter(AuthService auth) { this.auth = auth; }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
    String token = readCookie(request);
    if (token != null) {
      auth.validate(token).ifPresent(profile -> {
        var authority = new SimpleGrantedAuthority("ROLE_" + profile.role().name());
        var authentication = new UsernamePasswordAuthenticationToken(profile, null, List.of(authority));
        SecurityContextHolder.getContext().setAuthentication(authentication);
      });
    }
    chain.doFilter(request, response);
  }

  private String readCookie(HttpServletRequest request) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return null;
    for (Cookie cookie : cookies) if (COOKIE.equals(cookie.getName())) return cookie.getValue();
    return null;
  }
}
