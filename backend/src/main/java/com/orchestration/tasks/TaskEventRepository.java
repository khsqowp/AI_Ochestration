package com.orchestration.tasks;

import java.util.List;
import java.util.UUID;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;

interface TaskEventRepository extends JpaRepository<TaskEvent, UUID> {
  List<TaskEvent> findByTaskIdOrderByCreatedAtAsc(UUID taskId);
  List<TaskEvent> findByCreatedAtGreaterThanEqualAndTotalTokensIsNotNull(Instant from);
}
