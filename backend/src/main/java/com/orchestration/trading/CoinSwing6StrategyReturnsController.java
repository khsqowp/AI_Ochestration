package com.orchestration.trading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read-only strategy return summary from the six-symbol public-market-data paper test. */
@RestController
@RequestMapping("/api/trading/coin-swing6")
public class CoinSwing6StrategyReturnsController {
  private final Path statePath;
  private final ObjectMapper objectMapper;

  CoinSwing6StrategyReturnsController(
      @Value("${CRYPTO_PAPER_STRATEGY_STATE_PATH:/workspace/crypto-paper-state/crypto_paper_strategies_6symbols.json}")
          String statePath,
      ObjectMapper objectMapper) {
    this.statePath = Path.of(statePath);
    this.objectMapper = objectMapper;
  }

  @GetMapping("/strategy-returns")
  public StrategyReturnsState strategyReturns() throws IOException {
    if (!Files.isRegularFile(statePath)) {
      return StrategyReturnsState.empty();
    }

    JsonNode root = objectMapper.readTree(Files.readString(statePath));
    double startingEquity = root.path("assumptions")
        .path("starting_equity_per_strategy_usdt").asDouble(0.0);
    JsonNode summary = root.path("summary");
    if (!Double.isFinite(startingEquity) || startingEquity <= 0 || !summary.isObject()) {
      return StrategyReturnsState.empty();
    }

    List<StrategyReturn> strategies = new ArrayList<>();
    summary.fields().forEachRemaining(entry -> {
      JsonNode totalPnl = entry.getValue().path("total_pnl");
      if (!totalPnl.isNumber()) return;
      strategies.add(new StrategyReturn(
          entry.getKey(),
          entry.getValue().path("name").asText(entry.getKey()),
          totalPnl.asDouble() / startingEquity * 100.0));
    });

    List<String> symbols = new ArrayList<>();
    JsonNode symbolNodes = root.path("symbols");
    if (symbolNodes.isArray()) {
      symbolNodes.forEach(symbol -> {
        if (symbol.isTextual()) symbols.add(symbol.asText());
      });
    }
    String updatedAt = root.path("updated_at").isTextual()
        ? root.path("updated_at").asText() : null;
    return new StrategyReturnsState(updatedAt, List.copyOf(symbols), List.copyOf(strategies));
  }

  public record StrategyReturn(String strategyId, String name, double returnPct) {}

  public record StrategyReturnsState(
      String updatedAt, List<String> symbols, List<StrategyReturn> strategies) {
    static StrategyReturnsState empty() {
      return new StrategyReturnsState(null, List.of(), List.of());
    }
  }
}
