package com.orchestration.trading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** trading-momentum-rotation 컨테이너가 공유 볼륨에 쓰는 상태 파일을 읽어 그대로 내려준다. */
@RestController
@RequestMapping("/api/trading/momentum-rotation")
public class MomentumRotationStateController {
  private final Path statePath;
  private final ObjectMapper objectMapper;
  private final BinanceDisplayService binance;
  private final double correctionInception;

  MomentumRotationStateController(
      @Value("${app.trading.momentum-rotation-state-path:/workspace/trading-state-momentum-rotation/momentum_rotation_state.json}")
          String statePath,
      ObjectMapper objectMapper, BinanceDisplayService binance,
      @Value("${app.trading.momentum-rotation-correction-inception:144.45}") double correctionInception) {
    this.statePath = Path.of(statePath);
    this.objectMapper = objectMapper;
    this.binance = binance;
    this.correctionInception = correctionInception;
  }

  @GetMapping("/state")
  public ObjectNode state() throws IOException {
    MomentumRotationState state;
    if (!Files.exists(statePath)) {
      state = MomentumRotationState.empty();
    } else {
      state = objectMapper.readValue(Files.readString(statePath), MomentumRotationState.class);
    }
    ObjectNode result = objectMapper.valueToTree(state);
    var account = binance.account();
    double equity = account.has("marginBalance") ? account.path("marginBalance").asDouble()
        : state.broker() == null ? state.equityUsdt() : state.broker().equityUsdt();
    double unrealized = state.broker() == null ? state.unrealizedPnlUsdt() : state.broker().unrealizedPnlUsdt();
    if (state.broker() != null) {
      ObjectNode broker = (ObjectNode) result.path("broker");
      double pnl = MomentumDisplayCalculations.sessionPnl(unrealized);
      broker.put("sessionPnlUsdt", pnl).put("sessionReturnPct", MomentumDisplayCalculations.sessionReturnPct(pnl, equity));
    }
    result.set("walletBalance", account.has("walletBalance") ? account.get("walletBalance") : null);
    result.set("marginBalance", account.has("marginBalance") ? account.get("marginBalance") : null);
    double utilization = MomentumDisplayCalculations.marginUtilization(account.has("initialMargin") ? account.get("initialMargin").asDouble() : null, account.has("marginBalance") ? account.get("marginBalance").asDouble() : null);
    if (Double.isFinite(utilization)) result.put("marginUtilization", utilization); else result.putNull("marginUtilization");
    ObjectNode income = (ObjectNode) binance.realized();
    result.set("realizedIncome", income);
    List<MomentumDisplayCalculations.Income> transfers = new ArrayList<>();
    if (income.path("transfers").isArray()) for (var row : income.path("transfers")) transfers.add(new MomentumDisplayCalculations.Income("TRANSFER", row.path("income").asDouble(), row.path("time").asLong()));
    double entryCapital = MomentumDisplayCalculations.entryCapitalFromBaseline(ENTRY_CAPITAL_BASELINE_USDT, ENTRY_CAPITAL_BASELINE_MS, transfers);
    income.put("entryCapitalUsdt", entryCapital);
    result.put("entryCapitalUsdt", entryCapital);
    List<MomentumRotationState.EquityPoint> history = new ArrayList<>(state.equityHistory() == null ? List.of() : state.equityHistory());
    if (state.equityHistoryDaily() != null) for (var point : state.equityHistoryDaily()) {
      double corrected = MomentumDisplayCalculations.correctedDailyPnl(point.ts(), point.value(), state.inceptionEquityUsdt(), correctionInception);
      history.add(new MomentumRotationState.EquityPoint(point.ts(), corrected, state.inceptionEquityUsdt() + corrected, 0));
    }
    ObjectNode periods = objectMapper.createObjectNode();
    long now = System.currentTimeMillis();
    for (Map.Entry<String, Long> item : List.of(Map.entry("day", 86400000L), Map.entry("week", 7L * 86400000), Map.entry("month", 30L * 86400000))) {
      String key = item.getKey(); long duration = item.getValue();
      var p = MomentumDisplayCalculations.rollingPeriod(history, equity, state.inceptionEquityUsdt(), now, duration, transfers);
      ObjectNode point = periods.putObject(key).put("pnl", p.pnl()).put("returnPct", p.returnPct()).put("shortHistory", p.shortHistory());
      if (p.basisTs() == null) point.putNull("basisTs"); else point.put("basisTs", p.basisTs());
    }
    result.set("rollingPeriods", periods);
    if (state.equityHistory() != null && result.path("equityHistory").isArray()) {
      var points = (com.fasterxml.jackson.databind.node.ArrayNode) result.path("equityHistory");
      for (int i=0; i<state.equityHistory().size(); i++) { var p=state.equityHistory().get(i); ((ObjectNode) points.get(i)).put("totalPnlUsdt", MomentumDisplayCalculations.correctedPnl(p.ts(), p.totalPnlUsdt(), p.equityUsdt(), state.inceptionEquityUsdt(), correctionInception)); }
    }
    if (state.equityHistoryDaily() != null && result.path("equityHistoryDaily").isArray()) {
      var points = (com.fasterxml.jackson.databind.node.ArrayNode) result.path("equityHistoryDaily");
      for (int i=0; i<state.equityHistoryDaily().size(); i++) { var p=state.equityHistoryDaily().get(i); ((ObjectNode) points.get(i)).put("value", MomentumDisplayCalculations.correctedDailyPnl(p.ts(), p.value(), state.inceptionEquityUsdt(), correctionInception)); }
    }
    return result;
  }

  /** 2026-11-02T00:00Z 기준 순입금 합계(8-23 +35, 9-2 +35, 9-17 +74.01, 출금 없음). 이후 TRANSFER만 가산. */
  static final double ENTRY_CAPITAL_BASELINE_USDT = 144.01;
  static final long ENTRY_CAPITAL_BASELINE_MS = java.time.Instant.parse("2026-11-02T00:00:00Z").toEpochMilli();
  private long parseMillis(String value) {
    if (value == null || value.isBlank()) return 0;
    try { return Instant.parse(value).toEpochMilli(); } catch (Exception ignored) {
      try { return OffsetDateTime.parse(value).toInstant().toEpochMilli(); } catch (Exception invalid) { return 0; }
    }
  }
}
