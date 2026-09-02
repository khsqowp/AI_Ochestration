package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/**
 * trading-momentum-rotation 컨테이너(trading/app/momentum_state.py)가 공유 볼륨에 쓰는
 * momentum_rotation_state.json 구조. 2026-09 부터 실거래(mainnet, 2x) 모드로 전환됐고,
 * equity/positions/drawdown 은 바이낸스 API(totalMarginBalance, fetch_positions) 조회값이다
 * (state["broker"] 로도 모아둠). API 응답은 프런트 관례에 맞춰 camelCase.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record MomentumRotationState(
    Map<String, Position> positions,
    @JsonAlias("trade_log") List<LogEntry> tradeLog,
    String mode,
    @JsonAlias("equity_usdt") double equityUsdt,
    @JsonAlias("cumulative_realized_pnl_usdt") double cumulativeRealizedPnlUsdt,
    @JsonAlias("cumulative_fee_usdt") double cumulativeFeeUsdt,
    @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt,
    double drawdown,
    @JsonAlias("hwm_usdt") double hwmUsdt,
    @JsonAlias("inception_equity_usdt") double inceptionEquityUsdt,
    boolean halted,
    Broker broker,
    @JsonAlias("inception_ts") String inceptionTs,
    @JsonAlias("last_rebalance_ts") String lastRebalanceTs,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory,
    @JsonAlias("position_history") Map<String, List<PositionPoint>> positionHistory) {

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Position(
      String side,
      @JsonAlias("entry_price") double entryPrice,
      @JsonAlias("notional_usdt") double notionalUsdt,
      @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Broker(
      @JsonAlias("queried_ts") String queriedTs,
      String exchange,
      @JsonAlias("equity_usdt") double equityUsdt,
      @JsonAlias("inception_equity_usdt") double inceptionEquityUsdt,
      @JsonAlias("gross_notional_usdt") double grossNotionalUsdt,
      @JsonAlias("return_pct") double returnPct,
      @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt,
      double drawdown,
      @JsonAlias("hwm_usdt") double hwmUsdt,
      double leverage,
      boolean halted,
      Map<String, Position> positions) {}

  public record LogEntry(String ts, String message) {}

  public record EquityPoint(String ts, @JsonAlias("total_pnl_usdt") double totalPnlUsdt,
      @JsonAlias("equity_usdt") double equityUsdt, double drawdown) {}

  public record PositionPoint(String ts, double price, @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt) {}

  public static MomentumRotationState empty() {
    return new MomentumRotationState(
        Map.of(), List.of(), "paper", 0, 0, 0, 0, 0, 0, 0, false, null, null, null, List.of(), Map.of());
  }
}
