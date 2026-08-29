package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import java.util.List;
import java.util.Map;

/** trading-us-swing 컨테이너(trading/app/us_state.py)의 us_swing_state.json을 읽어들인다. */
public record UsTradingState(
    @JsonAlias("stop_price") Map<String, Double> stopPrice,
    @JsonAlias("entry_cost") Map<String, Double> entryCost,
    @JsonAlias("realized_pnl_usd") double realizedPnlUsd,
    @JsonAlias("pending_entries") List<String> pendingEntries,
    @JsonAlias("pending_exits") List<String> pendingExits,
    @JsonAlias("last_scan_date") String lastScanDate,
    @JsonAlias("trade_log") List<LogEntry> tradeLog) {

  public record LogEntry(String ts, String message) {}

  public static UsTradingState empty() {
    return new UsTradingState(Map.of(), Map.of(), 0, List.of(), List.of(), null, List.of());
  }
}
