package com.orchestration.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** High #3 -- app.auth.enabled=true with app.auth.cookie-secure=false means the session cookie carrying
 * the JWT would be sent over plain HTTP, letting it leak to any on-path observer. This must fail application
 * boot outright rather than silently deploy that combination. */
class AuthPropertiesTest {
  @Test
  void construction_failsFast_whenAuthIsEnabledWithAnInsecureCookie() {
    assertThatThrownBy(() -> new AuthProperties(true, false, "a@b.com", "A", "admin", "pw", "secret", ""))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void construction_succeeds_whenAuthIsEnabledWithASecureCookie() {
    assertThatCode(() -> new AuthProperties(true, true, "a@b.com", "A", "admin", "pw", "secret", ""))
        .doesNotThrowAnyException();
  }

  @Test
  void construction_succeeds_whenAuthIsDisabled_regardlessOfCookieSecure() {
    // Local dev default: auth is off entirely, so no cookie is ever issued -- the insecure-cookie
    // combination is meaningless (and shouldn't block running the app locally over plain http).
    assertThatCode(() -> new AuthProperties(false, false, "a@b.com", "A", "admin", "pw", "secret", ""))
        .doesNotThrowAnyException();
  }
}
