package com.orchestration.access;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

final class AccessLogSupport {
  private AccessLogSupport() {}

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
    return new AccessLogService.Hit(
        clientIp(r), method, path, status, r.getHeader("User-Agent"), hasSession(r), source,
        r.getHeader("CF-IPLatitude"), r.getHeader("CF-IPLongitude"),
        r.getHeader("CF-IPCity"), r.getHeader("CF-Region"), r.getHeader("CF-IPCountry"));
  }
}
