package com.orchestration.tasks;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@DataJpaTest
@TestPropertySource(properties = {"spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop"})
class WorkTaskRepositoryTest {
  @Autowired private WorkTaskRepository tasks;
  @Autowired private PlatformTransactionManager transactions;

  @Test
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  void claimRetryOnlySucceedsOnce() {
    TransactionTemplate transaction = new TransactionTemplate(transactions);
    WorkTask task = transaction.execute(status -> {
      WorkTask saved = tasks.save(new WorkTask("제목", "지시", TaskDomain.SECURITY, TaskOrigin.MANUAL));
      saved.fail("실패");
      return tasks.saveAndFlush(saved);
    });

    int first = transaction.execute(status -> tasks.claimRetry(task.getId(), TaskStatus.QUEUED, TaskStatus.FAILED));
    int second = transaction.execute(status -> tasks.claimRetry(task.getId(), TaskStatus.QUEUED, TaskStatus.FAILED));

    assertThat(first).isEqualTo(1);
    assertThat(second).isZero();
    assertThat(tasks.findById(task.getId()).orElseThrow().getStatus()).isEqualTo(TaskStatus.QUEUED);
  }
}
