package com.orchestration.trading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
    if (state.broker() != null) {
      ObjectNode broker = (ObjectNode) result.path("broker");
      double equity = state.broker().equityUsdt(), start = state.broker().sessionStartEquityUsdt();
      double pnl = MomentumDisplayCalculations.sessionPnl(equity, start);
      broker.put("sessionPnlUsdt", pnl).put("sessionReturnPct", MomentumDisplayCalculations.sessionReturnPct(pnl, start));
    }
    var account = binance.account();
    result.set("walletBalance", account.has("walletBalance") ? account.get("walletBalance") : null);
    result.set("marginBalance", account.has("marginBalance") ? account.get("marginBalance") : null);
    double utilization = MomentumDisplayCalculations.marginUtilization(account.has("initialMargin") ? account.get("initialMargin").asDouble() : null, account.has("marginBalance") ? account.get("marginBalance").asDouble() : null);
    if (Double.isFinite(utilization)) result.put("marginUtilization", utilization); else result.putNull("marginUtilization");
    result.set("realizedIncome", binance.realized());
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
}
