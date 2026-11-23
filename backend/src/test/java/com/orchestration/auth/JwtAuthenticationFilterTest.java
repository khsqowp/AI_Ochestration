package com.orchestration.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

/** Regression coverage for the "random logout" bug: once {@code app.auth.cookie-domain} started scoping
 * the session cookie to {@code .khsqowp1.my}, a browser can end up holding two {@code orchestration_session}
 * cookies at once (an older host-only one plus the new domain-wide one) and sends both. Which one the
 * servlet container lists first is outside this app's control, so the filter must try every same-named
 * cookie and accept whichever one actually validates -- in either order. */
@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {
  private static final String COOKIE = "orchestration_session";
  @Mock private AuthService auth;

  private AuthService.UserProfile profile() {
    return new AuthService.UserProfile("1", "admin@local.dev", "Admin", Role.ADMIN);
  }

  @Test
  void twoCookies_validOneFirst_stillAuthenticates() throws Exception {
    // The filter stops at the first cookie that validates, so with the valid one first it never
    // needs to try the stale one -- nothing to stub for it here.
    when(auth.validate("good-token")).thenReturn(Optional.of(profile()));

    assertAuthenticatedAfterFilter(new jakarta.servlet.http.Cookie(COOKIE, "good-token"), new jakarta.servlet.http.Cookie(COOKIE, "stale-token"));
  }

  @Test
  void twoCookies_validOneSecond_stillAuthenticates() throws Exception {
    when(auth.validate("good-token")).thenReturn(Optional.of(profile()));
    when(auth.validate("stale-token")).thenReturn(Optional.empty());

    assertAuthenticatedAfterFilter(new jakarta.servlet.http.Cookie(COOKIE, "stale-token"), new jakarta.servlet.http.Cookie(COOKIE, "good-token"));
  }

  @Test
  void noCookieValidates_leavesRequestUnauthenticated() throws Exception {
    when(auth.validate("stale-token-a")).thenReturn(Optional.empty());
    when(auth.validate("stale-token-b")).thenReturn(Optional.empty());

    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setCookies(new jakarta.servlet.http.Cookie(COOKIE, "stale-token-a"), new jakarta.servlet.http.Cookie(COOKIE, "stale-token-b"));
    MockHttpServletResponse response = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();

    SecurityContextHolder.clearContext();
    new JwtAuthenticationFilter(auth).doFilter(request, response, chain);

    assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
  }

  private void assertAuthenticatedAfterFilter(jakarta.servlet.http.Cookie... cookies) throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setCookies(cookies);
    MockHttpServletResponse response = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();

    SecurityContextHolder.clearContext();
    new JwtAuthenticationFilter(auth).doFilter(request, response, chain);

    var authentication = SecurityContextHolder.getContext().getAuthentication();
    assertThat(authentication).isNotNull();
    assertThat(authentication.getPrincipal()).isEqualTo(profile());
    assertThat(authentication.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_ADMIN");
  }
}
