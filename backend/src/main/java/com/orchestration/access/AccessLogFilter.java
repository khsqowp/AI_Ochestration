package com.orchestration.access;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Records every {@code /api/**} hit (except the internal track endpoint and actuator) after the
 * response status is known. Edge hits — landing, /order, /login, path probes — are captured
 * separately by nginx's mirror to {@link EdgeTrackController}. */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class AccessLogFilter extends OncePerRequestFilter {
  private final AccessLogService service;

  AccessLogFilter(AccessLogService service) { this.service = service; }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String p = request.getRequestURI();
    return !p.startsWith("/api/") || p.startsWith("/api/internal/") || p.startsWith("/actuator");
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    try {
      chain.doFilter(request, response);
    } finally {
      try {
        service.record(AccessLogSupport.hit(request, request.getRequestURI(), request.getMethod(),
            response.getStatus(), "api"));
      } catch (Exception ignored) {
        // logging must never break a request
      }
    }
  }
}
