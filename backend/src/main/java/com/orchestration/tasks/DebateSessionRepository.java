package com.orchestration.tasks;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DebateSessionRepository extends JpaRepository<DebateSession, UUID> {
  java.util.List<DebateSession> findAllByOrderByCreatedAtDesc();
}
