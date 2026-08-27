package com.orchestration.sources;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface SourceCandidateRepository extends JpaRepository<SourceCandidate, UUID> {
  List<SourceCandidate> findByStatusOrderByDiscoveredAtDesc(CandidateStatus status);
  List<SourceCandidate> findByStatusAndDiscoveredAtBefore(CandidateStatus status, Instant cutoff);
}
