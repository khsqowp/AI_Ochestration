package com.orchestration.training;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface BlackBoxScenarioSessionRepository extends JpaRepository<BlackBoxScenarioSession, UUID> {
  Optional<BlackBoxScenarioSession> findByIdAndOwnerId(UUID id, UUID ownerId);
  List<BlackBoxScenarioSession> findByOwnerIdOrderByStartedAtDesc(UUID ownerId);
  List<BlackBoxScenarioSession> findByOwnerIdAndStatusOrderByClosedAtDesc(UUID ownerId, BlackBoxSessionStatus status);
}
