package com.orchestration.training;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

interface BlackBoxScenarioSessionRepository extends JpaRepository<BlackBoxScenarioSession, UUID> {
  Optional<BlackBoxScenarioSession> findByIdAndOwnerId(UUID id, UUID ownerId);
  Optional<BlackBoxScenarioSession> findFirstByOwnerIdAndStatusOrderByStartedAtDesc(UUID ownerId, BlackBoxSessionStatus status);
  Optional<BlackBoxScenarioSession> findFirstByOwnerIdAndStatusAndAiGeneratedTrueOrderByStartedAtDesc(UUID ownerId, BlackBoxSessionStatus status);
  // Medium #15 -- paginated so a learner with a long history doesn't force-load every past session on
  // every visit to the history tab; the AI-generated filter moved into the query itself (was previously
  // applied in-memory after fetching everything) since filtering after paging would return short pages.
  List<BlackBoxScenarioSession> findByOwnerIdAndAiGeneratedTrueOrderByStartedAtDesc(UUID ownerId, Pageable pageable);
  List<BlackBoxScenarioSession> findByOwnerIdAndStatusOrderByClosedAtDesc(UUID ownerId, BlackBoxSessionStatus status);
}
