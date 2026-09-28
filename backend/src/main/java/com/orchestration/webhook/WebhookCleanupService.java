package com.orchestration.webhook;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Sweeps expired bins (and their captured requests) daily -- the capture endpoint has zero auth,
 * so nothing else bounds how long an old bin's data would otherwise sit in the database.
 */
@Service
class WebhookCleanupService {
  private final WebhookBinRepository bins;
  private final WebhookRequestRepository requests;

  WebhookCleanupService(WebhookBinRepository bins, WebhookRequestRepository requests) {
    this.bins = bins;
    this.requests = requests;
  }

  @Scheduled(cron = "${app.webhook.cleanup-cron:0 15 4 * * *}", zone = "Asia/Seoul")
  void sweepExpired() {
    List<WebhookBin> expired = bins.findByExpiresAtBefore(Instant.now());
    if (expired.isEmpty()) return;
    List<UUID> ids = expired.stream().map(WebhookBin::getId).toList();
    requests.deleteByBinIdIn(ids);
    bins.deleteAll(expired);
  }
}
