package com.orchestration.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Reads the session cookie once per request and, if it holds a valid, non-revoked JWT, populates the
 * Spring Security context so downstream {@code authorizeHttpRequests}/{@code @PreAuthorize} rules can see an
 * authenticated principal with a {@code ROLE_*} authority. Only registered when {@code app.auth.enabled}.
 *
 * <p>Since {@code app.auth.cookie-domain} started scoping the cookie to {@code .khsqowp1.my} (for
 * subdomain SSO), a browser that still holds an older host-only {@code orchestration_session} cookie
 * from before that rollout -- or any other reason the jar ends up with two entries for this name --
 * sends both on the same request. Which one the servlet container lists first is browser-determined,
 * not something this app controls, so picking only the first candidate caused intermittent/"random"
 * logouts when the stale one happened to win even though a valid one was right next to it. Trying every
 * same-named cookie and accepting the first one that actually validates fixes that regardless of order. */
class JwtAuthenticationFilter extends OncePerRequestFilter {
  private static final String COOKIE = "orchestration_session";
  private final AuthService auth;

  JwtAuthenticationFilter(AuthService auth) { this.auth = auth; }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
    for (String token : readCookies(request)) {
      var profile = auth.validate(token);
      if (profile.isPresent()) {
        var authority = new SimpleGrantedAuthority("ROLE_" + profile.get().role().name());
        var authentication = new UsernamePasswordAuthenticationToken(profile.get(), null, List.of(authority));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        break;
      }
    }
    chain.doFilter(request, response);
  }

  private List<String> readCookies(HttpServletRequest request) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return List.of();
    List<String> values = new ArrayList<>();
    for (Cookie cookie : cookies) if (COOKIE.equals(cookie.getName())) values.add(cookie.getValue());
    return values;
  }
}
