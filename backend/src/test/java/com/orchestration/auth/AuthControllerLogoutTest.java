package com.orchestration.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;

/** Regression coverage for the "random logout" fix: once {@code app.auth.cookie-domain} is configured,
 * a browser can be carrying both the current domain-wide cookie and an older host-only one from before
 * that rollout. Logout must clear both cookie slots, not just the domain-scoped one, or the user can
 * still appear logged in via the stray cookie afterwards. */
@ExtendWith(MockitoExtension.class)
class AuthControllerLogoutTest {
  @Mock private AuthService service;

  @Test
  void logout_withCookieDomainConfigured_clearsBothTheDomainWideAndHostOnlyCookie() {
    AuthProperties properties = new AuthProperties(true, true, "a@b.com", "A", "admin", "pw", "test-jwt-secret-0123456789-0123456789", "", ".khsqowp1.my");
    AuthController controller = new AuthController(service, properties);

    var response = controller.logout("some-token");

    List<String> setCookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
    assertThat(setCookies).hasSize(2);
    assertThat(setCookies).anySatisfy(header -> assertThat(header)
        .contains("orchestration_session=")
        .contains("Domain=.khsqowp1.my")
        .containsIgnoringCase("Max-Age=0"));
    assertThat(setCookies).anySatisfy(header -> assertThat(header)
        .contains("orchestration_session=")
        .doesNotContain("Domain=")
        .containsIgnoringCase("Max-Age=0"));
  }

  @Test
  void logout_withNoCookieDomainConfigured_clearsOnlyTheSingleHostOnlyCookie() {
    AuthProperties properties = new AuthProperties(true, true, "a@b.com", "A", "admin", "pw", "test-jwt-secret-0123456789-0123456789", "", "");
    AuthController controller = new AuthController(service, properties);

    var response = controller.logout("some-token");

    List<String> setCookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
    assertThat(setCookies).hasSize(1);
    assertThat(setCookies.get(0)).doesNotContain("Domain=").containsIgnoringCase("Max-Age=0");
  }
}
