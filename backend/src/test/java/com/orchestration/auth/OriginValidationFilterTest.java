package com.orchestration.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** High #2, CSRF defense-in-depth -- see {@link OriginValidationFilter} for why this exists alongside the
 * SameSite=Lax cookie that's already the primary defense. */
class OriginValidationFilterTest {
  private OriginValidationFilter filter(String allowedOrigins) {
    return new OriginValidationFilter(new AuthProperties(true, true, "a@b.com", "A", "admin", "pw", "secret", allowedOrigins));
  }

  @Test
  void safeMethods_areNeverRejected_regardlessOfOrigin() {
    OriginValidationFilter filter = filter("");

    assertThat(filter.isRejected("GET", "https://evil.example", "https://app.example")).isFalse();
    assertThat(filter.isRejected("HEAD", "https://evil.example", "https://app.example")).isFalse();
  }

  @Test
  void stateChangingMethod_withNoOriginHeader_isNotRejected() {
    // Many legitimate requests omit Origin (non-browser clients, older browsers) -- this is
    // defense-in-depth layered on SameSite=Lax, not the sole defense, so it must not become an
    // availability bug for those.
    OriginValidationFilter filter = filter("");

    assertThat(filter.isRejected("POST", null, "https://app.example")).isFalse();
    assertThat(filter.isRejected("POST", "", "https://app.example")).isFalse();
  }

  @Test
  void stateChangingMethod_withMatchingSameOrigin_isNotRejected() {
    OriginValidationFilter filter = filter("");

    assertThat(filter.isRejected("POST", "https://app.example", "https://app.example")).isFalse();
    assertThat(filter.isRejected("DELETE", "https://app.example", "https://app.example")).isFalse();
  }

  @Test
  void stateChangingMethod_withACrossSiteOriginNotOnTheAllowlist_isRejected() {
    OriginValidationFilter filter = filter("");

    assertThat(filter.isRejected("POST", "https://evil.example", "https://app.example")).isTrue();
    assertThat(filter.isRejected("PUT", "https://evil.example", "https://app.example")).isTrue();
    assertThat(filter.isRejected("PATCH", "https://evil.example", "https://app.example")).isTrue();
    assertThat(filter.isRejected("DELETE", "https://evil.example", "https://app.example")).isTrue();
  }

  @Test
  void stateChangingMethod_withACrossSiteOriginOnTheAllowlist_isNotRejected() {
    OriginValidationFilter filter = filter("https://trusted.example, https://other.example");

    assertThat(filter.isRejected("POST", "https://trusted.example", "https://app.example")).isFalse();
    assertThat(filter.isRejected("POST", "https://other.example", "https://app.example")).isFalse();
  }

  @Test
  void parseAllowedOrigins_splitsAndTrimsCommaSeparatedList_ignoringBlankConfig() {
    assertThat(OriginValidationFilter.parseAllowedOrigins(null)).isEmpty();
    assertThat(OriginValidationFilter.parseAllowedOrigins("  ")).isEmpty();
    assertThat(OriginValidationFilter.parseAllowedOrigins("https://a.example, https://b.example ,https://c.example"))
        .containsExactlyInAnyOrder("https://a.example", "https://b.example", "https://c.example");
  }
}
