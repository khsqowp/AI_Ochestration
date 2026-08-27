package com.orchestration.sources;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface ResearchSourceRepository extends JpaRepository<ResearchSource, UUID> {
  List<ResearchSource> findAllByOrderByDomainAscCreatedAtDesc();
  List<ResearchSource> findByEnabledTrueOrderByDomainAscCreatedAtAsc();
  List<ResearchSource> findByEnabledTrueAndNextRetryAtLessThanEqual(Instant now);
}

