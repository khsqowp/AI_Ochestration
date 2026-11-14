package com.orchestration.diag;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

interface EvidenceRepository extends JpaRepository<EvidenceRecord, UUID> {
  boolean existsBySha256(String sha256);
}
