package com.orchestration.tasks;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface WorkTaskRepository extends JpaRepository<WorkTask, UUID> {
  List<WorkTask> findTop20ByOrderByCreatedAtDesc();
  List<WorkTask> findByStatus(TaskStatus status);
  List<WorkTask> findByStatusIn(List<TaskStatus> statuses);
  List<WorkTask> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(Instant from);
  List<WorkTask> findByBatchJobNameAndStatus(String batchJobName, TaskStatus status);
  @Modifying
  @Query("update WorkTask t set t.status = :queued where t.id = :id and t.status = :expected")
  int claimRetry(@Param("id") UUID id, @Param("queued") TaskStatus queued, @Param("expected") TaskStatus expected);
}
