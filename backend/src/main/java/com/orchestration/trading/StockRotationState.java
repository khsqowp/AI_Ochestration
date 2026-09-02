package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/**
 * trading-kr-rotation / trading-us-rotation 컨테이너(trading/app/stock_rotation_state.py)가
 * 공유 볼륨에 쓰는 stock_rotation_state.json 구조. 잔고/평가/손익은 KIS 잔고 API 조회값
 * (state["broker"])을 그대로 내려준다 — 백엔드/프런트에서 재계산하지 않는다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record StockRotationState(
    @JsonAlias("symbol_names") Map<String, String> symbolNames,
    @JsonAlias("realized_pnl") double realizedPnl,
    @JsonAlias("unrealized_pnl") double unrealizedPnl,
    double equity,
    @JsonAlias("deployed_value") double deployedValue,
    @JsonAlias("held_symbols") List<String> heldSymbols,
    @JsonAlias("target_basket") List<String> targetBasket,
    @JsonAlias("pending_sells") List<String> pendingSells,
    @JsonAlias("pending_buys") List<String> pendingBuys,
    @JsonAlias("last_plan_date") String lastPlanDate,
    @JsonAlias("last_rebalance_date") String lastRebalanceDate,
    @JsonAlias("regime_cash") boolean regimeCash,
    Broker broker,
    @JsonAlias("trade_log") List<LogEntry> tradeLog,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory,
    @JsonAlias("position_history") Map<String, List<PositionPoint>> positionHistory) {

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Broker(
      @JsonAlias("queried_ts") String queriedTs,
      Map<String, Position> positions,
      @JsonAlias("positions_eval") double positionsEval,
      @JsonAlias("positions_unrealized_pnl") double positionsUnrealizedPnl,
      @JsonAlias("account_cash_krw") double accountCashKrw,
      @JsonAlias("account_total_krw") double accountTotalKrw) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Position(
      double qty,
      double price,
      @JsonAlias("eval_amt") double evalAmt,
      @JsonAlias("purchase_amt") double purchaseAmt,
      double pnl,
      @JsonAlias("pnl_pct") double pnlPct) {}

  public record LogEntry(String ts, String message) {}

  public record EquityPoint(String ts, @JsonAlias("total_pnl") double totalPnl, double equity, double deployed) {}

  public record PositionPoint(String ts, double price, @JsonAlias("unrealized_pnl") double unrealizedPnl) {}

  public static StockRotationState empty() {
    return new StockRotationState(
        Map.of(), 0, 0, 0, 0, List.of(), List.of(), List.of(), List.of(), null, null, false,
        null, List.of(), List.of(), Map.of());
  }
}
