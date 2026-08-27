package com.orchestration.tasks;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface WorkTaskRepository extends JpaRepository<WorkTask, UUID> {
  List<WorkTask> findTop20ByOrderByCreatedAtDesc();
  List<WorkTask> findByStatus(TaskStatus status);
  List<WorkTask> findByStatusIn(List<TaskStatus> statuses);
  List<WorkTask> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(Instant from);
  List<WorkTask> findByBatchJobNameAndStatus(String batchJobName, TaskStatus status);
}
