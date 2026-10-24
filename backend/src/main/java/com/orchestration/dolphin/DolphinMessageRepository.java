package com.orchestration.dolphin;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface DolphinMessageRepository extends JpaRepository<DolphinMessage, UUID> {
  List<DolphinMessage> findBySessionIdOrderByPositionAsc(UUID sessionId);
  long countBySessionId(UUID sessionId);
  void deleteBySessionId(UUID sessionId);
}
