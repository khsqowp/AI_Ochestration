package com.orchestration.webhook;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * The capture endpoint has zero authentication by design -- external services need to be able to
 * hit it without an app login. Every safeguard here exists to bound what an anonymous caller can
 * do to this server, not to gate access to the data: body is capped and truncated rather than
 * buffered unbounded, requests per bin are capped (oldest evicted on insert) so one noisy bin
 * can't grow forever, and bins expire so idle ones get swept ({@link WebhookCleanupService}).
 */
@Service
public class WebhookService {
  private static final int MAX_REQUESTS_PER_BIN = 200;
  private static final int MAX_BODY_BYTES = 16 * 1024;
  private static final Duration BIN_TTL = Duration.ofDays(7);

  private final WebhookBinRepository bins;
  private final WebhookRequestRepository requests;
  private final ObjectMapper objectMapper;

  WebhookService(WebhookBinRepository bins, WebhookRequestRepository requests, ObjectMapper objectMapper) {
    this.bins = bins;
    this.requests = requests;
    this.objectMapper = objectMapper;
  }

  WebhookBin createBin() {
    Instant now = Instant.now();
    return bins.save(new WebhookBin(now, now.plus(BIN_TTL)));
  }

  Optional<WebhookBin> findBin(UUID token) {
    return bins.findById(token).filter(bin -> bin.getExpiresAt().isAfter(Instant.now()));
  }

  List<WebhookRequest> listRequests(UUID token) {
    return requests.findTop200ByBinIdOrderByReceivedAtDesc(token);
  }

  /** @return false if the bin doesn't exist or already expired -- caller responds 404 without storing anything. */
  boolean capture(UUID token, HttpServletRequest request) {
    if (findBin(token).isEmpty()) return false;

    Map<String, String> headers = new LinkedHashMap<>();
    Enumeration<String> names = request.getHeaderNames();
    if (names != null) {
      while (names.hasMoreElements()) {
        String name = names.nextElement();
        headers.put(name, String.join(", ", Collections.list(request.getHeaders(name))));
      }
    }
    String headersJson;
    try {
      headersJson = objectMapper.writeValueAsString(headers);
    } catch (Exception e) {
      headersJson = "{}";
    }

    String prefix = "/api/webhook/capture/" + token;
    String uri = request.getRequestURI();
    String path = uri.startsWith(prefix) ? uri.substring(prefix.length()) : uri;
    if (path.isEmpty()) path = "/";
    if (path.length() > 1024) path = path.substring(0, 1024);
    String query = request.getQueryString();
    if (query != null && query.length() > 1024) query = query.substring(0, 1024);

    byte[] bodyBytes;
    try {
      bodyBytes = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
    } catch (IOException e) {
      bodyBytes = new byte[0];
    }
    boolean truncated = bodyBytes.length > MAX_BODY_BYTES;
    if (truncated) bodyBytes = Arrays.copyOf(bodyBytes, MAX_BODY_BYTES);
    String body = new String(bodyBytes, StandardCharsets.UTF_8);

    long declaredLength = request.getContentLengthLong();
    Long contentLength = declaredLength >= 0 ? declaredLength : null;

    requests.save(new WebhookRequest(token, Instant.now(), request.getMethod(), path, query, clientIp(request),
        request.getContentType(), contentLength, headersJson, body, truncated));

    trim(token);
    return true;
  }

  /** Same header-fallback order as the access-log filter (CF-Connecting-IP -> X-Real-IP ->
   * X-Forwarded-For -> socket peer) -- duplicated locally rather than reused across packages since
   * that helper is package-private to {@code com.orchestration.access}. */
  private static String clientIp(HttpServletRequest r) {
    String cf = r.getHeader("CF-Connecting-IP");
    if (cf != null && !cf.isBlank()) return cf.trim();
    String xr = r.getHeader("X-Real-IP");
    if (xr != null && !xr.isBlank()) return xr.trim();
    String xff = r.getHeader("X-Forwarded-For");
    if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
    return r.getRemoteAddr();
  }

  private void trim(UUID token) {
    if (requests.countByBinId(token) <= MAX_REQUESTS_PER_BIN) return;
    List<WebhookRequest> ordered = requests.findByBinIdOrderByReceivedAtDesc(token);
    if (ordered.size() > MAX_REQUESTS_PER_BIN) {
      requests.deleteAll(ordered.subList(MAX_REQUESTS_PER_BIN, ordered.size()));
    }
  }
}
