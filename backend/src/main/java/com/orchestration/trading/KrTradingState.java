package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import java.util.List;
import java.util.Map;

/**
 * trading-kr-swing 컨테이너(trading/app/kr_state.py)가 공유 볼륨에 쓰는 kr_swing_state.json
 * 구조를 읽어들이되, API 응답은 프런트엔드 관례에 맞춰 camelCase로 내려준다.
 */
public record KrTradingState(
    @JsonAlias("stop_price") Map<String, Double> stopPrice,
    @JsonAlias("entry_cost") Map<String, Double> entryCost,
    @JsonAlias("realized_pnl_krw") double realizedPnlKrw,
    @JsonAlias("pending_entries") List<String> pendingEntries,
    @JsonAlias("pending_exits") List<String> pendingExits,
    @JsonAlias("last_scan_date") String lastScanDate,
    @JsonAlias("trade_log") List<LogEntry> tradeLog,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory,
    @JsonAlias("position_history") Map<String, List<PositionPoint>> positionHistory) {

  public record LogEntry(String ts, String message) {}
  public record EquityPoint(String ts, @JsonAlias("total_pnl_krw") double totalPnlKrw) {}
  public record PositionPoint(String ts, double price, @JsonAlias("unrealized_pnl_krw") double unrealizedPnlKrw) {}

  public static KrTradingState empty() {
    return new KrTradingState(Map.of(), Map.of(), 0, List.of(), List.of(), null, List.of(), List.of(), Map.of());
  }
}
