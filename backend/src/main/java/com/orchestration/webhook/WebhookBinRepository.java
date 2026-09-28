package com.orchestration.webhook;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface WebhookBinRepository extends JpaRepository<WebhookBin, UUID> {
  List<WebhookBin> findByExpiresAtBefore(Instant cutoff);
}
