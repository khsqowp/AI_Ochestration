package com.orchestration.tasks;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/usage")
public class UsageController {
  private final TaskEventRepository events;
  private final LlmProperties llm;
  private final BigDecimal budgetUsdPerMonth;
  UsageController(TaskEventRepository events, LlmProperties llm, @Value("${app.budget.usd-per-month:20.00}") BigDecimal budgetUsdPerMonth) {
    this.events = events; this.llm = llm; this.budgetUsdPerMonth = budgetUsdPerMonth;
  }

  @GetMapping("/summary")
  public UsageSummary summary(@RequestParam(defaultValue = "30") int days) {
    int safeDays = Math.max(1, Math.min(days, 365));
    Instant from = Instant.now().minus(safeDays, ChronoUnit.DAYS);
    List<TaskEvent> usages = events.findByCreatedAtGreaterThanEqualAndTotalTokensIsNotNull(from);
    Map<String, List<TaskEvent>> groups = usages.stream().collect(Collectors.groupingBy(event -> event.getModel() == null ? "알 수 없는 모델" : event.getModel()));
    List<ModelUsage> models = groups.entrySet().stream().map(entry -> toUsage(entry.getKey(), entry.getValue())).sorted(Comparator.comparing(ModelUsage::tokens).reversed()).toList();
    ModelUsage rawTotal = toUsage("전체", usages);
    BigDecimal totalCost = models.stream().map(ModelUsage::estimatedCostUsd).reduce(BigDecimal.ZERO, BigDecimal::add);
    ModelUsage total = new ModelUsage("전체", rawTotal.calls(), rawTotal.inputTokens(), rawTotal.outputTokens(), rawTotal.tokens(), rawTotal.elapsedMs(), totalCost);
    BigDecimal monthToDateCostUsd = monthToDateCost();
    return new UsageSummary(from.toString(), Instant.now().toString(), safeDays, models, total, monthToDateCostUsd, budgetUsdPerMonth, monthToDateCostUsd.compareTo(budgetUsdPerMonth) > 0);
  }

  /** Independent of the "days" window above — this is always the calendar month to date, since a budget is a monthly concept regardless of which lookback the usage table is currently showing. */
  private BigDecimal monthToDateCost() {
    Instant monthStart = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    List<TaskEvent> usages = events.findByCreatedAtGreaterThanEqualAndTotalTokensIsNotNull(monthStart);
    Map<String, List<TaskEvent>> groups = usages.stream().collect(Collectors.groupingBy(event -> event.getModel() == null ? "알 수 없는 모델" : event.getModel()));
    return groups.entrySet().stream().map(entry -> toUsage(entry.getKey(), entry.getValue()).estimatedCostUsd()).reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private ModelUsage toUsage(String model, List<TaskEvent> rows) {
    long input = rows.stream().map(TaskEvent::getInputTokens).filter(java.util.Objects::nonNull).mapToLong(Integer::longValue).sum();
    long output = rows.stream().map(TaskEvent::getOutputTokens).filter(java.util.Objects::nonNull).mapToLong(Integer::longValue).sum();
    long elapsed = rows.stream().map(TaskEvent::getElapsedMs).filter(java.util.Objects::nonNull).mapToLong(Long::longValue).sum();
    BigDecimal cost = calculateCurrentRate(model, input, output, rows);
    return new ModelUsage(model, rows.size(), input, output, input + output, elapsed, cost);
  }

  private BigDecimal calculateCurrentRate(String model, long input, long output, List<TaskEvent> rows) {
    String normalized = model.toLowerCase();
    if (normalized.contains("gemini")) return tokenCost(input, output, llm.geminiInputUsdPerMillion(), llm.geminiOutputUsdPerMillion());
    if (normalized.contains("deepseek")) return tokenCost(input, output, llm.deepseekInputUsdPerMillion(), llm.deepseekOutputUsdPerMillion());
    if (normalized.contains("gpt") || normalized.contains("openai")) return tokenCost(input, output, llm.openaiInputUsdPerMillion(), llm.openaiOutputUsdPerMillion());
    return rows.stream().map(TaskEvent::getEstimatedCostUsd).filter(java.util.Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private BigDecimal tokenCost(long input, long output, BigDecimal inputRate, BigDecimal outputRate) {
    BigDecimal inputCost = BigDecimal.valueOf(input).multiply(inputRate).movePointLeft(6);
    BigDecimal outputCost = BigDecimal.valueOf(output).multiply(outputRate).movePointLeft(6);
    return inputCost.add(outputCost).setScale(8, java.math.RoundingMode.HALF_UP);
  }
  record UsageSummary(String from, String to, int days, List<ModelUsage> models, ModelUsage total, BigDecimal monthToDateCostUsd, BigDecimal budgetUsdPerMonth, boolean budgetExceeded) {}
  record ModelUsage(String model, int calls, long inputTokens, long outputTokens, long tokens, long elapsedMs, BigDecimal estimatedCostUsd) {}
}
