package com.orchestration.access;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Target of nginx's {@code mirror} subrequest for non-API traffic (see frontend/nginx.conf). One row
 * per edge hit — the visitor's real path, IP and Cloudflare geo headers. Never returns a body; the
 * mirror response is discarded by nginx anyway.
 *
 * <p>permitAll in SecurityConfig, but only accepts calls whose socket peer is on a private network —
 * i.e. the nginx container. A direct external POST to {@code /api/internal/track} is dropped.
 */
@RestController
@RequestMapping("/api/internal/track")
public class EdgeTrackController {
  private final AccessLogService service;

  EdgeTrackController(AccessLogService service) { this.service = service; }

  @RequestMapping
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void track(HttpServletRequest request) {
    if (!GeoLocator.isPrivate(request.getRemoteAddr())) return; // not from nginx — ignore

    String path = header(request, "X-Orig-URI", "/");
    String method = header(request, "X-Orig-Method", "GET");
    // skip the noise nginx serves straight off disk
    if (path.startsWith("/assets/") || path.equals("/build-info.json") || path.equals("/favicon.ico")) return;

    service.record(AccessLogSupport.hit(request, path, method, -1, "edge"));
  }

  private static String header(HttpServletRequest r, String name, String fallback) {
    String v = r.getHeader(name);
    return v == null || v.isBlank() ? fallback : v;
  }
}
