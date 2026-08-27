package com.orchestration.tasks;

import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class TaskExecutionConfig {
  @Bean("taskWorkflowExecutor")
  Executor taskWorkflowExecutor(@Value("${app.tasks.workflow-concurrency:2}") int configuredConcurrency) {
    int concurrency = Math.max(1, Math.min(configuredConcurrency, 4));
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(concurrency);
    executor.setMaxPoolSize(concurrency);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("task-workflow-");
    executor.initialize();
    return executor;
  }

  /** Bounded so a large source list doesn't fire dozens of simultaneous crawls at once — each site is
   * still paced individually by its own robots.txt crawl-delay, this just lets different sites run
   * side by side instead of waiting on each other in a single queue. */
  @Bean("sourceCollectionExecutor")
  Executor sourceCollectionExecutor(@Value("${app.sources.collection-concurrency:5}") int configuredConcurrency) {
    int concurrency = Math.max(1, Math.min(configuredConcurrency, 8));
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(concurrency);
    executor.setMaxPoolSize(concurrency);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("source-collection-");
    executor.initialize();
    return executor;
  }
}
