package com.orchestration.webhook;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface WebhookRequestRepository extends JpaRepository<WebhookRequest, UUID> {
  List<WebhookRequest> findTop200ByBinIdOrderByReceivedAtDesc(UUID binId);

  List<WebhookRequest> findByBinIdOrderByReceivedAtDesc(UUID binId);

  long countByBinId(UUID binId);

  void deleteByBinIdIn(List<UUID> binIds);
}
