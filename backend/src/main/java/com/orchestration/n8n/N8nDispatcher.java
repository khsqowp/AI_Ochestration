package com.orchestration.n8n;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.files.FileIntakeJob;
import com.orchestration.tasks.DigestService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Sends metadata only. File contents remain in the mounted originals directory until a future approved workflow reads them. */
@Service
public class N8nDispatcher {
  private static final Logger log = LoggerFactory.getLogger(N8nDispatcher.class);
  /** Full archive notes run well past this (the archive enforces a 12,500-char minimum), so only a preview
   * is forwarded — Slack isn't meant to replace the archive UI, just point back to it. */
  private static final int ARCHIVE_PREVIEW_LIMIT = 1500;
  private final N8nProperties properties;
  private final ObjectMapper mapper = new ObjectMapper();
  private final HttpClient client = HttpClient.newBuilder()
      .version(HttpClient.Version.HTTP_1_1)
      .connectTimeout(Duration.ofSeconds(10))
      .build();

  N8nDispatcher(N8nProperties properties) { this.properties = properties; }

  public void dispatchFileIntake(FileIntakeJob job) {
    if (!properties.dispatchEnabled()) {
      log.info("n8n_file_intake_skipped jobId={} reason=dispatch_disabled", job.getId());
      return;
    }
    String json = "{\"jobId\":\"" + job.getId() + "\",\"sourcePath\":\"" + escape(job.getSourcePath())
        + "\",\"fileName\":\"" + escape(job.getFileName()) + "\",\"extension\":\"" + escape(job.getExtension()) + "\"}";
    HttpRequest request = HttpRequest.newBuilder(URI.create(properties.fileIntakeWebhookUrl()))
        .timeout(Duration.ofSeconds(15))
        .header("Content-Type", "application/json").header("X-Webhook-Secret", properties.webhookSecret())
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
    log.info("n8n_file_intake_dispatching jobId={} sourcePath={}", job.getId(), job.getSourcePath());
    client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
        .thenAccept(response -> log.info("n8n_file_intake_dispatched jobId={} status={}", job.getId(), response.statusCode()))
        .exceptionally(exception -> { log.warn("n8n_file_intake_dispatch_failed jobId={}", job.getId(), exception); return null; });
  }

  public void dispatchDigest(DigestService.DigestResult digest) {
    if (!properties.dispatchEnabled()) {
      log.info("n8n_digest_skipped period={} reason=dispatch_disabled", digest.period());
      return;
    }
    String json;
    try {
      json = mapper.writeValueAsString(digest);
    } catch (Exception exception) {
      log.warn("n8n_digest_serialize_failed period={}", digest.period(), exception);
      return;
    }
    HttpRequest request = HttpRequest.newBuilder(URI.create(properties.digestWebhookUrl()))
        .timeout(Duration.ofSeconds(15))
        .header("Content-Type", "application/json").header("X-Webhook-Secret", properties.webhookSecret())
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
    log.info("n8n_digest_dispatching period={} total={}", digest.period(), digest.total());
    client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
        .thenAccept(response -> log.info("n8n_digest_dispatched period={} status={}", digest.period(), response.statusCode()))
        .exceptionally(exception -> { log.warn("n8n_digest_dispatch_failed period={}", digest.period(), exception); return null; });
  }

  public void dispatchArchiveCreated(String archivePath, com.orchestration.tasks.WorkTask task, String content) {
    if (!properties.dispatchEnabled()) {
      log.info("n8n_archive_created_skipped taskId={} reason=dispatch_disabled", task.getId());
      return;
    }
    String preview = content.length() <= ARCHIVE_PREVIEW_LIMIT ? content : content.substring(0, ARCHIVE_PREVIEW_LIMIT) + "\n\n...(전체 내용은 파일 아카이브에서 확인)";
    String json;
    try {
      json = mapper.writeValueAsString(new ArchiveCreatedPayload(archivePath, task.getId().toString(), task.getTitle(), task.getDomain().name(), preview));
    } catch (Exception exception) {
      log.warn("n8n_archive_created_serialize_failed taskId={}", task.getId(), exception);
      return;
    }
    HttpRequest request = HttpRequest.newBuilder(URI.create(properties.archiveWebhookUrl()))
        .timeout(Duration.ofSeconds(15))
        .header("Content-Type", "application/json").header("X-Webhook-Secret", properties.webhookSecret())
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
    log.info("n8n_archive_created_dispatching taskId={} archivePath={}", task.getId(), archivePath);
    client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
        .thenAccept(response -> log.info("n8n_archive_created_dispatched taskId={} status={}", task.getId(), response.statusCode()))
        .exceptionally(exception -> { log.warn("n8n_archive_created_dispatch_failed taskId={}", task.getId(), exception); return null; });
  }

  public void dispatchTradingHalted(double totalPnlUsdt, double totalCapitalUsdt) {
    if (!properties.dispatchEnabled()) {
      log.info("n8n_trading_halted_skipped reason=dispatch_disabled");
      return;
    }
    String json;
    try {
      json = mapper.writeValueAsString(new TradingHaltedPayload(totalPnlUsdt, totalCapitalUsdt));
    } catch (Exception exception) {
      log.warn("n8n_trading_halted_serialize_failed", exception);
      return;
    }
    HttpRequest request = HttpRequest.newBuilder(URI.create(properties.tradingHaltedWebhookUrl()))
        .timeout(Duration.ofSeconds(15))
        .header("Content-Type", "application/json").header("X-Webhook-Secret", properties.webhookSecret())
        .POST(HttpRequest.BodyPublishers.ofString(json)).build();
    log.info("n8n_trading_halted_dispatching totalPnlUsdt={}", totalPnlUsdt);
    client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
        .thenAccept(response -> log.info("n8n_trading_halted_dispatched status={}", response.statusCode()))
        .exceptionally(exception -> { log.warn("n8n_trading_halted_dispatch_failed", exception); return null; });
  }

  private record TradingHaltedPayload(double totalPnlUsdt, double totalCapitalUsdt) {}

  private record ArchiveCreatedPayload(String archivePath, String taskId, String title, String domain, String contentPreview) {}

  private String escape(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
  }
}
