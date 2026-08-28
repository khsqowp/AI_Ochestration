package com.orchestration.tasks;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DebateTurnRepository extends JpaRepository<DebateTurn, UUID> {
  List<DebateTurn> findBySessionIdOrderByTurnIndexAsc(UUID sessionId);
}
