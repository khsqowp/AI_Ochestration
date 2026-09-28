package com.orchestration.webhook;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One captured HTTP request against a {@link WebhookBin}. Headers are stored pre-serialized as
 * JSON text (a flat {@code Map<String,String>}) rather than a child table -- nothing here needs
 * querying by header, only display in the viewer.
 */
@Entity
@Table(name = "webhook_request",
    indexes = @Index(name = "idx_webhook_request_bin", columnList = "bin_id, received_at"))
public class WebhookRequest {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;

  @Column(name = "bin_id", nullable = false) private UUID binId;
  @Column(name = "received_at", nullable = false) private Instant receivedAt;

  @Column(nullable = false, length = 10) private String method;
  @Column(nullable = false, length = 1024) private String path;
  @Column(name = "query_string", length = 1024) private String queryString;
  @Column(name = "remote_ip", length = 64) private String remoteIp;
  @Column(name = "content_type", length = 256) private String contentType;
  @Column(name = "content_length") private Long contentLength;

  @Lob @Column(name = "headers_json", columnDefinition = "TEXT") private String headersJson;
  @Lob @Column(name = "body_text", columnDefinition = "TEXT") private String bodyText;
  @Column(name = "body_truncated", nullable = false) private boolean bodyTruncated;

  protected WebhookRequest() {}

  WebhookRequest(UUID binId, Instant receivedAt, String method, String path, String queryString,
                 String remoteIp, String contentType, Long contentLength,
                 String headersJson, String bodyText, boolean bodyTruncated) {
    this.binId = binId;
    this.receivedAt = receivedAt;
    this.method = method;
    this.path = path;
    this.queryString = queryString;
    this.remoteIp = remoteIp;
    this.contentType = contentType;
    this.contentLength = contentLength;
    this.headersJson = headersJson;
    this.bodyText = bodyText;
    this.bodyTruncated = bodyTruncated;
  }

  public UUID getId() { return id; }
  public UUID getBinId() { return binId; }
  public Instant getReceivedAt() { return receivedAt; }
  public String getMethod() { return method; }
  public String getPath() { return path; }
  public String getQueryString() { return queryString; }
  public String getRemoteIp() { return remoteIp; }
  public String getContentType() { return contentType; }
  public Long getContentLength() { return contentLength; }
  public String getHeadersJson() { return headersJson; }
  public String getBodyText() { return bodyText; }
  public boolean isBodyTruncated() { return bodyTruncated; }
}
