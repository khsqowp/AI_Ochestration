package com.orchestration.sources;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface GeminiCollectionBatchRepository extends JpaRepository<GeminiCollectionBatch, UUID> {
  List<GeminiCollectionBatch> findByProcessedFalse();
}
