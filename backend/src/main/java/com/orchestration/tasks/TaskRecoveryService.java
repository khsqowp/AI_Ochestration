package com.orchestration.tasks;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class TaskRecoveryService {
  private final TaskService tasks;
  private final TaskWorkflowRunner runner;

  TaskRecoveryService(TaskService tasks, TaskWorkflowRunner runner) {
    this.tasks = tasks;
    this.runner = runner;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void resumeInterruptedTasks() {
    tasks.recoverInterrupted().forEach(runner::execute);
  }
}
