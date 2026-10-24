package com.orchestration.trading;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CoinSwing6StrategyReturnsControllerTest {
  @TempDir Path tempDir;

  @Test
  void returnsMarkToMarketPnlAsPercentOfEachStrategiesStartingCapital() throws IOException {
    Path state = tempDir.resolve("state.json");
    Files.writeString(state, """
        {
          "updated_at": "2026-10-18T04:14:00Z",
          "symbols": ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB"],
          "assumptions": {"starting_equity_per_strategy_usdt": 142.0},
          "summary": {
            "alpha": {"name": "Alpha", "total_pnl": 1.42},
            "beta": {"name": "Beta", "total_pnl": -0.71}
          }
        }
        """);

    var result = new CoinSwing6StrategyReturnsController(state.toString(), new ObjectMapper())
        .strategyReturns();

    assertEquals(List.of("BTC", "ETH", "SOL", "XRP", "DOGE", "BNB"), result.symbols());
    assertEquals(2, result.strategies().size());
    assertEquals(1.0, result.strategies().get(0).returnPct(), 1e-9);
    assertEquals(-0.5, result.strategies().get(1).returnPct(), 1e-9);
  }

  @Test
  void missingStateReturnsNoInventedPerformance() throws IOException {
    var result = new CoinSwing6StrategyReturnsController(
        tempDir.resolve("not-created.json").toString(), new ObjectMapper()).strategyReturns();

    assertTrue(result.strategies().isEmpty());
    assertTrue(result.symbols().isEmpty());
  }
}
