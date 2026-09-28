package com.orchestration.webhook;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Bin management + viewer API for the webhook-capture tool (webhook.site-alike). Fully permitAll
 * in SecurityConfig -- the random UUID token IS the access control, same trust model as
 * {@code /api/orders/mine}'s name+pin.
 */
@RestController
@RequestMapping("/api/webhook/bins")
public class WebhookBinController {
  private static final TypeReference<Map<String, Object>> HEADER_MAP = new TypeReference<>() {};

  private final WebhookService service;
  private final ObjectMapper objectMapper;

  WebhookBinController(WebhookService service, ObjectMapper objectMapper) {
    this.service = service;
    this.objectMapper = objectMapper;
  }

  @PostMapping
  public BinResponse create() {
    return BinResponse.from(service.createBin());
  }

  @GetMapping("/{token}")
  public BinResponse get(@PathVariable UUID token) {
    return service.findBin(token).map(BinResponse::from).orElseThrow(WebhookBinController::notFound);
  }

  @GetMapping("/{token}/requests")
  public List<RequestResponse> requests(@PathVariable UUID token) {
    if (service.findBin(token).isEmpty()) throw notFound();
    return service.listRequests(token).stream().map(r -> RequestResponse.from(r, objectMapper)).toList();
  }

  @DeleteMapping("/{token}/requests/{requestId}")
  public void deleteOne(@PathVariable UUID token, @PathVariable UUID requestId) {
    if (service.findBin(token).isEmpty()) throw notFound();
    if (!service.deleteRequest(token, requestId)) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "캡처된 요청을 찾을 수 없습니다.");
    }
  }

  @DeleteMapping("/{token}/requests")
  public void deleteAll(@PathVariable UUID token) {
    if (service.findBin(token).isEmpty()) throw notFound();
    service.clearRequests(token);
  }

  private static ResponseStatusException notFound() {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, "존재하지 않거나 만료된 웹훅입니다.");
  }

  record BinResponse(String token, Instant createdAt, Instant expiresAt) {
    static BinResponse from(WebhookBin bin) { return new BinResponse(bin.getId().toString(), bin.getCreatedAt(), bin.getExpiresAt()); }
  }

  record RequestResponse(String id, Instant receivedAt, String method, String path, String queryString,
                          String remoteIp, String contentType, Long contentLength,
                          Map<String, Object> headers, String body, boolean bodyTruncated) {
    static RequestResponse from(WebhookRequest r, ObjectMapper mapper) {
      Map<String, Object> headers;
      try { headers = mapper.readValue(r.getHeadersJson(), HEADER_MAP); } catch (Exception e) { headers = Map.of(); }
      return new RequestResponse(r.getId().toString(), r.getReceivedAt(), r.getMethod(), r.getPath(),
          r.getQueryString(), r.getRemoteIp(), r.getContentType(), r.getContentLength(), headers, r.getBodyText(), r.isBodyTruncated());
    }
  }
}
