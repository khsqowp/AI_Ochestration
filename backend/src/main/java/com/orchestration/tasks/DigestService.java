package com.orchestration.tasks;

import com.orchestration.n8n.N8nDispatcher;
import com.orchestration.sources.ResearchDomain;
import com.orchestration.sources.ResearchSource;
import com.orchestration.sources.ResearchSourceService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Deterministic rollup of recent task activity — no LLM call, since a factual ops report
 * shouldn't risk paraphrasing/hallucinating over data that's already exact in the database. */
@Service
public class DigestService {
  private static final Logger log = LoggerFactory.getLogger(DigestService.class);
  // A source stuck producing NO_NEW_CONTENT for weeks is easy to miss unless it's surfaced somewhere the
  // owner actually looks — the in-app badge (App.tsx) only shows up if someone opens the source list, so
  // the digest repeats the same threshold here to reach the same Slack channel everything else lands in.
  private static final int NO_CONTENT_ALERT_THRESHOLD = 3;
  private final WorkTaskRepository tasks;
  private final N8nDispatcher dispatcher;
  private final ResearchSourceService sources;

  DigestService(WorkTaskRepository tasks, N8nDispatcher dispatcher, ResearchSourceService sources) {
    this.tasks = tasks; this.dispatcher = dispatcher; this.sources = sources;
  }

  /** n8n's own workflow decides delivery (email/Slack/etc.) once it receives the payload; dispatch here
   * is a no-op when app.n8n.dispatch-enabled is false, same gate the file-intake dispatch already uses. */
  @Scheduled(cron = "${app.digest.daily-cron:0 0 9 * * *}")
  void dispatchDailyDigest() { dispatcher.dispatchDigest(generate(Period.DAILY)); }

  @Scheduled(cron = "${app.digest.weekly-cron:0 0 9 * * MON}")
  void dispatchWeeklyDigest() { dispatcher.dispatchDigest(generate(Period.WEEKLY)); }

  public enum Period { DAILY, WEEKLY }

  public static Period parsePeriod(String value) {
    try {
      return Period.valueOf(value.toUpperCase(Locale.ROOT));
    } catch (IllegalArgumentException | NullPointerException exception) {
      throw new IllegalArgumentException("period must be DAILY or WEEKLY");
    }
  }

  public DigestResult generate(Period period) {
    Instant from = Instant.now().minus(period == Period.DAILY ? Duration.ofDays(1) : Duration.ofDays(7));
    List<WorkTask> window = tasks.findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(from);
    List<WorkTask> completed = window.stream().filter(task -> task.getStatus() == TaskStatus.COMPLETED).toList();
    List<WorkTask> failed = window.stream().filter(task -> task.getStatus() == TaskStatus.FAILED).toList();
    Map<String, Long> byDomain = window.stream()
        .collect(Collectors.groupingBy(task -> task.getDomain().name(), Collectors.counting()));
    List<DigestEntry> completedEntries = completed.stream()
        .map(task -> new DigestEntry(task.getId().toString(), task.getTitle(), task.getDomain().name(), task.getArchivePath()))
        .toList();
    List<DigestEntry> failedEntries = failed.stream()
        .map(task -> new DigestEntry(task.getId().toString(), task.getTitle(), task.getDomain().name(), task.getFailureReason()))
        .toList();
    List<NoContentSource> noContentSources = sources.list().stream()
        .filter(source -> source.getConsecutiveNoContentCycles() >= NO_CONTENT_ALERT_THRESHOLD)
        .map(source -> new NoContentSource(source.getName(), source.getDomain(), source.getConsecutiveNoContentCycles()))
        .toList();
    log.info("digest_generated period={} from={} total={} completed={} failed={} noContentSources={}", period, from, window.size(), completed.size(), failed.size(), noContentSources.size());
    return new DigestResult(period.name(), from.toString(), Instant.now().toString(), window.size(), completed.size(), failed.size(), byDomain, completedEntries, failedEntries, noContentSources);
  }

  public record DigestEntry(String taskId, String title, String domain, String detail) {}
  public record NoContentSource(String name, ResearchDomain domain, int consecutiveNoContentCycles) {}

  public record DigestResult(String period, String from, String to, int total, int completed, int failed,
      Map<String, Long> byDomain, List<DigestEntry> completedTasks, List<DigestEntry> failedTasks,
      List<NoContentSource> noContentSources) {}
}
