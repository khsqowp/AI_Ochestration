package com.orchestration.tasks;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskService {
  private final WorkTaskRepository tasks;
  private final TaskEventRepository events;
  private final ObjectProvider<TaskWorkflowRunner> runner;

  TaskService(WorkTaskRepository tasks, TaskEventRepository events, ObjectProvider<TaskWorkflowRunner> runner) { this.tasks = tasks; this.events = events; this.runner = runner; }

  @Transactional
  public WorkTask create(String title, String instruction, TaskDomain domain, TaskOrigin origin) {
    return create(title, instruction, domain, origin, (String) null);
  }

  @Transactional
  public WorkTask create(String title, String instruction, TaskDomain domain, TaskOrigin origin, String attachmentPath) {
    WorkTask task = tasks.save(new WorkTask(title.trim(), instruction.trim(), domain, origin, attachmentPath));
    return queue(task);
  }

  /** Same as {@link #create(String, String, TaskDomain, TaskOrigin, String)} but for collection tasks
   * created from a research source, so completion outcome can be reported back to that specific source. */
  @Transactional
  public WorkTask create(String title, String instruction, TaskDomain domain, TaskOrigin origin, java.util.UUID sourceId) {
    WorkTask task = tasks.save(new WorkTask(title.trim(), instruction.trim(), domain, origin, sourceId));
    return queue(task);
  }

  private WorkTask queue(WorkTask task) {
    event(task.getId(), "QUEUE", "작업을 대기열에 등록했습니다. 수집이 성공한 경우에만 검토·팀장·PM 단계로 진행합니다.", null);
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override public void afterCommit() { runner.getObject().execute(task.getId()); }
    });
    return task;
  }

  /** Registers the task without triggering the workflow — used by the nightly source-collection batch,
   * whose COLLECT stage is a Gemini batch job resumed later by {@link TaskWorkflowRunner#resumeFromBatchCollection}
   * once results arrive, rather than run in real time like every other task. */
  @Transactional
  public WorkTask createAwaitingBatch(String title, String instruction, TaskDomain domain, TaskOrigin origin, java.util.UUID sourceId) {
    WorkTask task = tasks.save(new WorkTask(title.trim(), instruction.trim(), domain, origin, sourceId));
    task.markAwaitingBatch();
    event(task.getId(), "QUEUE", "야간 배치로 수집 중입니다. 결과가 도착하면 검토·팀장·PM 단계로 진행합니다.", null);
    return task;
  }

  @Transactional
  public void attachBatchJob(UUID id, String batchJobName) { get(id).attachBatchJob(batchJobName); }

  @Transactional(readOnly = true)
  public List<WorkTask> findAwaitingBatch(String batchJobName) { return tasks.findByBatchJobNameAndStatus(batchJobName, TaskStatus.AWAITING_BATCH); }

  @Transactional(readOnly = true)
  public WorkTask get(UUID id) { return tasks.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)); }
  @Transactional(readOnly = true)
  public List<WorkTask> recent() { return tasks.findTop20ByOrderByCreatedAtDesc(); }
  public void retry(UUID id) { get(id); runner.getObject().execute(id); }
  /** Covers both RUNNING (mid-pipeline when the process died) and QUEUED (already committed to the DB but
   * whose in-memory afterCommit() submission to the workflow executor was lost with the old process) --
   * without the QUEUED half, a task queued right before a redeploy is silently orphaned forever, stuck at
   * QUEUED with no in-flight execution anywhere to ever finish it. */
  @Transactional
  public List<UUID> recoverInterrupted() {
    List<UUID> recovered = tasks.findByStatusIn(List.of(TaskStatus.RUNNING, TaskStatus.QUEUED)).stream().map(WorkTask::getId).toList();
    recovered.forEach(id -> event(id, "RECOVERY", "서버 재시작으로 중단된 작업입니다. 같은 작업을 처음부터 다시 대기열에 넣었습니다.", null));
    return recovered;
  }
  @Transactional(readOnly = true)
  public List<TaskEvent> events(UUID id) { get(id); return events.findByTaskIdOrderByCreatedAtAsc(id); }
  @Transactional public void start(UUID id) { get(id).start(); }
  @Transactional public void complete(UUID id, String report, String archivePath) { get(id).complete(report, archivePath); event(id, "ARCHIVE", "최종 보고를 지식베이스에 보관했습니다: " + archivePath, "Archive"); }
  /** Collection-origin tasks whose team-lead review found nothing worth keeping skip archiving entirely
   * (no {@code archivePath}) rather than writing a placeholder note with no real content. */
  @Transactional public void completeWithoutArchive(UUID id, String report) { get(id).complete(report, null); event(id, "ARCHIVE", "새로 아카이브에 남길 내용이 없어 보관을 건너뛰었습니다.", "Archive"); }
  @Transactional public void fail(UUID id, String reason) { get(id).fail(reason); event(id, "PM", "작업을 중단했습니다: " + reason, "DeepSeek V4-Pro"); }
  @Transactional public void failCollection(UUID id, String reason) { get(id).fail(reason); event(id, "COLLECT_FAILED", "수집 단계에서 중단했습니다. 검토·팀장·PM에는 전달하지 않았습니다: " + reason, null); }
  /** Only a still-in-flight task can be stopped -- a task that already reached a terminal state can't be
   * "cancelled" after the fact without misrepresenting what actually happened to it. */
  @Transactional
  public void cancel(UUID id) {
    WorkTask task = get(id);
    if (task.getStatus() == TaskStatus.COMPLETED || task.getStatus() == TaskStatus.FAILED || task.getStatus() == TaskStatus.CANCELLED) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 종료된 작업은 중지할 수 없습니다.");
    }
    task.cancel();
    event(id, "CANCELLED", "사용자가 작업을 중지했습니다.", null);
  }
  /** {@link TaskWorkflowRunner} polls this between pipeline stages so a stop request takes effect as soon
   * as the in-flight LLM call for the current stage finishes, instead of running the whole pipeline to
   * completion regardless of the cancel. */
  @Transactional(readOnly = true)
  public boolean isCancelled(UUID id) { return get(id).getStatus() == TaskStatus.CANCELLED; }
  @Transactional public void event(UUID id, String stage, String message, String model) { events.save(new TaskEvent(id, stage, message, model)); }
  @Transactional public void modelEvent(UUID id, String stage, String message, LlmGateway.LlmResult result, BigDecimal estimatedCostUsd) { events.save(new TaskEvent(id, stage, message, result, estimatedCostUsd)); }
}
