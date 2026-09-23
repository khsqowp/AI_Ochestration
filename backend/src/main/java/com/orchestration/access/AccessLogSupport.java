package com.orchestration.access;

import com.orchestration.auth.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

final class AccessLogSupport {
  private AccessLogSupport() {}

  /** AccessLogFilter runs at LOWEST_PRECEDENCE, after Spring Security's chain (incl.
   * JwtAuthenticationFilter) has already resolved the principal for this request thread -- so this is
   * safe to read from a plain servlet filter without any @PreAuthorize/@AuthenticationPrincipal wiring. */
  private static AuthService.UserProfile currentUser() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return authentication != null && authentication.getPrincipal() instanceof AuthService.UserProfile profile
        ? profile : null;
  }

  static String clientIp(HttpServletRequest r) {
    String cf = r.getHeader("CF-Connecting-IP");
    if (cf != null && !cf.isBlank()) return cf.trim();
    String xr = r.getHeader("X-Real-IP");
    if (xr != null && !xr.isBlank()) return xr.trim();
    String xff = r.getHeader("X-Forwarded-For");
    if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
    return r.getRemoteAddr();
  }

  static boolean hasSession(HttpServletRequest r) {
    Cookie[] cs = r.getCookies();
    if (cs != null) for (Cookie c : cs) if ("orchestration_session".equals(c.getName())) return true;
    String h = r.getHeader("Cookie");
    return h != null && h.contains("orchestration_session=");
  }

  static AccessLogService.Hit hit(HttpServletRequest r, String path, String method, int status, String source) {
    AuthService.UserProfile user = currentUser();
    return new AccessLogService.Hit(
        clientIp(r), method, path, status, r.getHeader("User-Agent"), hasSession(r), source,
        user == null ? null : user.email(), user == null ? null : user.displayName(),
        r.getHeader("CF-IPLatitude"), r.getHeader("CF-IPLongitude"),
        r.getHeader("CF-IPCity"), r.getHeader("CF-Region"), r.getHeader("CF-IPCountry"));
  }
}
