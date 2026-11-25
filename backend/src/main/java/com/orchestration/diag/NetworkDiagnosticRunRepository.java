package com.orchestration.diag;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface NetworkDiagnosticRunRepository extends JpaRepository<NetworkDiagnosticRunRecord, UUID> {
  List<NetworkDiagnosticRunRecord> findTop50ByRequestedByUserIdOrderByCreatedAtDesc(UUID userId);
}
