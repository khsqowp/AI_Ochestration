package com.orchestration.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/** TaskService is the spine every stage of the collect -> review -> team-lead -> PM -> archive pipeline
 * writes through, but it had zero coverage before this: a regression here (e.g. the workflow runner firing
 * before commit, or {@code createAwaitingBatch} accidentally scheduling immediate execution the way
 * {@code create} does) would only ever surface in production. These tests pin down the two queuing paths'
 * very different transaction-synchronization behavior and the terminal-state/event-writing methods. */
@ExtendWith(MockitoExtension.class)
class TaskServiceTest {

  @Mock private WorkTaskRepository tasks;
  @Mock private TaskEventRepository events;
  @Mock private ObjectProvider<TaskWorkflowRunner> runnerProvider;
  @Mock private TaskWorkflowRunner runner;

  private TaskService service;

  @BeforeEach
  void setUp() {
    service = new TaskService(tasks, events, runnerProvider);
  }

  @AfterEach
  void tearDown() {
    if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
  }

  @Test
  void create_savesQueuedTask_recordsQueueEvent_andOnlySchedulesTheRunnerAfterCommit() {
    when(tasks.save(any(WorkTask.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(runnerProvider.getObject()).thenReturn(runner);
    TransactionSynchronizationManager.initSynchronization();

    WorkTask created = service.create("제목", "지시 내용", TaskDomain.SECURITY, TaskOrigin.MANUAL);

    assertThat(created.getTitle()).isEqualTo("제목");
    assertThat(created.getInstruction()).isEqualTo("지시 내용");
    assertThat(created.getStatus()).isEqualTo(TaskStatus.QUEUED);
    ArgumentCaptor<TaskEvent> eventCaptor = ArgumentCaptor.forClass(TaskEvent.class);
    verify(events).save(eventCaptor.capture());
    assertThat(eventCaptor.getValue().getStage()).isEqualTo("QUEUE");
    // Registering afterCommit doesn't run it -- the workflow must not start mid-transaction.
    verify(runner, never()).execute(any());

    TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCommit());

    verify(runner, times(1)).execute(created.getId());
  }

  @Test
  void createAwaitingBatch_marksAwaitingBatchStatus_andNeverRegistersARunnerSynchronization() {
    UUID sourceId = UUID.randomUUID();

    when(tasks.save(any(WorkTask.class))).thenAnswer(invocation -> invocation.getArgument(0));

    WorkTask created = service.createAwaitingBatch("제목", "지시", TaskDomain.SECURITY, TaskOrigin.COLLECTION, sourceId);

    assertThat(created.getStatus()).isEqualTo(TaskStatus.AWAITING_BATCH);
    assertThat(created.getSourceId()).isEqualTo(sourceId);
    // Unlike create(), the nightly batch path resumes the workflow later from
    // TaskWorkflowRunner#resumeFromBatchCollection -- it must not also schedule an immediate run.
    assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
  }

  @Test
  void get_throwsNotFound_whenTaskDoesNotExist() {
    UUID id = UUID.randomUUID();
    when(tasks.findById(id)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.get(id))
        .isInstanceOf(ResponseStatusException.class)
        .extracting(exception -> ((ResponseStatusException) exception).getStatusCode().value())
        .isEqualTo(404);
  }

  @Test
  void complete_marksCompletedWithArchivePath_andRecordsArchiveEvent() {
    UUID id = UUID.randomUUID();
    WorkTask task = new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.MANUAL);
    when(tasks.findById(id)).thenReturn(Optional.of(task));

    service.complete(id, "최종 보고서", "security/note.md");

    assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
    assertThat(task.getFinalReport()).isEqualTo("최종 보고서");
    assertThat(task.getArchivePath()).isEqualTo("security/note.md");
    ArgumentCaptor<TaskEvent> eventCaptor = ArgumentCaptor.forClass(TaskEvent.class);
    verify(events).save(eventCaptor.capture());
    assertThat(eventCaptor.getValue().getStage()).isEqualTo("ARCHIVE");
    assertThat(eventCaptor.getValue().getMessage()).contains("security/note.md");
  }

  @Test
  void completeWithoutArchive_marksCompletedWithNoArchivePath_whenNothingWasWorthKeeping() {
    UUID id = UUID.randomUUID();
    WorkTask task = new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.COLLECTION);
    when(tasks.findById(id)).thenReturn(Optional.of(task));

    service.completeWithoutArchive(id, "새로 남길 내용 없음");

    assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
    assertThat(task.getArchivePath()).isNull();
    assertThat(task.getFinalReport()).isEqualTo("새로 남길 내용 없음");
  }

  @Test
  void fail_marksFailedWithReason_andRecordsPmStageEvent() {
    UUID id = UUID.randomUUID();
    WorkTask task = new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.MANUAL);
    when(tasks.findById(id)).thenReturn(Optional.of(task));

    service.fail(id, "PM이 반려했습니다");

    assertThat(task.getStatus()).isEqualTo(TaskStatus.FAILED);
    assertThat(task.getFailureReason()).isEqualTo("PM이 반려했습니다");
    ArgumentCaptor<TaskEvent> eventCaptor = ArgumentCaptor.forClass(TaskEvent.class);
    verify(events).save(eventCaptor.capture());
    assertThat(eventCaptor.getValue().getStage()).isEqualTo("PM");
  }

  @Test
  void failCollection_marksFailedWithReason_andRecordsCollectFailedStage_distinctFromRegularFail() {
    UUID id = UUID.randomUUID();
    WorkTask task = new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.COLLECTION);
    when(tasks.findById(id)).thenReturn(Optional.of(task));

    service.failCollection(id, "수집 소스에 접속할 수 없습니다");

    assertThat(task.getStatus()).isEqualTo(TaskStatus.FAILED);
    ArgumentCaptor<TaskEvent> eventCaptor = ArgumentCaptor.forClass(TaskEvent.class);
    verify(events).save(eventCaptor.capture());
    // Collection failures must not be reported under the "PM" stage: a collect-time outage was never
    // seen by review/team-lead/PM, and mislabeling it would make the timeline look like a PM rejection.
    assertThat(eventCaptor.getValue().getStage()).isEqualTo("COLLECT_FAILED");
  }

  @Test
  void recoverInterrupted_emitsRecoveryEventForEveryStillRunningTask() {
    WorkTask stuckOne = mock(WorkTask.class);
    WorkTask stuckTwo = mock(WorkTask.class);
    UUID idOne = UUID.randomUUID();
    UUID idTwo = UUID.randomUUID();
    when(stuckOne.getId()).thenReturn(idOne);
    when(stuckTwo.getId()).thenReturn(idTwo);
    when(tasks.findByStatusIn(List.of(TaskStatus.RUNNING, TaskStatus.QUEUED))).thenReturn(List.of(stuckOne, stuckTwo));

    List<UUID> recovered = service.recoverInterrupted();

    assertThat(recovered).containsExactlyInAnyOrder(idOne, idTwo);
    ArgumentCaptor<TaskEvent> eventCaptor = ArgumentCaptor.forClass(TaskEvent.class);
    verify(events, times(2)).save(eventCaptor.capture());
    assertThat(eventCaptor.getAllValues()).allMatch(event -> event.getStage().equals("RECOVERY"));
    assertThat(eventCaptor.getAllValues().stream().map(TaskEvent::getTaskId)).containsExactlyInAnyOrder(idOne, idTwo);
  }

  @Test
  void retry_reExecutesTheWorkflowRunner_forAnExistingTask() {
    UUID id = UUID.randomUUID();
    WorkTask task = new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.MANUAL);
    when(tasks.findById(id)).thenReturn(Optional.of(task));
    when(runnerProvider.getObject()).thenReturn(runner);

    service.retry(id);

    verify(runner).execute(id);
  }

  @Test
  void retry_throwsNotFound_insteadOfExecuting_whenTaskDoesNotExist() {
    UUID id = UUID.randomUUID();
    when(tasks.findById(id)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.retry(id)).isInstanceOf(ResponseStatusException.class);
    verify(runnerProvider, never()).getObject();
  }

  @Test
  void cancel_marksCancelled_andRecordsEvent_whenTaskIsStillInFlight() {
    UUID id = UUID.randomUUID();
    WorkTask task = new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.MANUAL);
    when(tasks.findById(id)).thenReturn(Optional.of(task));

    service.cancel(id);

    assertThat(task.getStatus()).isEqualTo(TaskStatus.CANCELLED);
    ArgumentCaptor<TaskEvent> eventCaptor = ArgumentCaptor.forClass(TaskEvent.class);
    verify(events).save(eventCaptor.capture());
    assertThat(eventCaptor.getValue().getStage()).isEqualTo("CANCELLED");
    assertThat(service.isCancelled(id)).isTrue();
  }

  @Test
  void cancel_throwsConflict_whenTaskAlreadyReachedATerminalState() {
    UUID id = UUID.randomUUID();
    WorkTask task = new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.MANUAL);
    task.complete("보고서", "security/note.md");
    when(tasks.findById(id)).thenReturn(Optional.of(task));

    // A completed task must not be reinterpreted as cancelled after the fact -- that would misrepresent
    // what actually happened and silently disagree with the archive path/final report already recorded.
    assertThatThrownBy(() -> service.cancel(id))
        .isInstanceOf(ResponseStatusException.class)
        .extracting(exception -> ((ResponseStatusException) exception).getStatusCode().value())
        .isEqualTo(409);
    assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
  }
}
