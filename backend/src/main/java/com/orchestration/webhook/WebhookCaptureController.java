package com.orchestration.webhook;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Catch-all capture endpoint -- accepts every HTTP method and any sub-path/body/content-type,
 * because the whole point is to receive whatever an external service (SSRF/blind-XSS/OOB test
 * target) throws at it. No {@code method=} restriction on @RequestMapping means Spring dispatches
 * every verb here.
 */
@RestController
public class WebhookCaptureController {
  private final WebhookService service;

  WebhookCaptureController(WebhookService service) { this.service = service; }

  @RequestMapping({"/api/webhook/capture/{token}", "/api/webhook/capture/{token}/**"})
  public ResponseEntity<String> capture(@PathVariable UUID token, HttpServletRequest request) {
    boolean captured = service.capture(token, request);
    if (!captured) return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.TEXT_PLAIN).body("unknown or expired bin");
    return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body("OK");
  }
}
