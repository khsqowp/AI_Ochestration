package com.orchestration.webhook;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A capture "bin" -- its {@code id} IS the public bearer token embedded in the capture URL
 * ({@code /api/webhook/capture/{id}/...}). No account is attached; possession of the URL is the
 * only access control, same trust model as webhook.site. Expires after a fixed window so an
 * unauthenticated, indefinitely-writable endpoint doesn't grow the database forever
 * (see {@link WebhookCleanupService}).
 */
@Entity
@Table(name = "webhook_bin")
public class WebhookBin {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;

  @Column(name = "created_at", nullable = false) private Instant createdAt;
  @Column(name = "expires_at", nullable = false) private Instant expiresAt;

  protected WebhookBin() {}

  WebhookBin(Instant createdAt, Instant expiresAt) {
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
  }

  public UUID getId() { return id; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getExpiresAt() { return expiresAt; }
}
