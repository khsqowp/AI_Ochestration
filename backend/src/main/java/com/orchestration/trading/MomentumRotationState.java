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
    @JsonAlias("next_rebalance_ts") String nextRebalanceTs,
    @JsonAlias("rebalance_every_days") Integer rebalanceEveryDays,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory,
    @JsonAlias("position_history") Map<String, List<PositionPoint>> positionHistory,
    // 프런트가 방금 보낸 즉시매도/진입 명령의 nonce 와 대조해 "봇이 실제로 처리했는지"를 폴링으로
    // 확인하는 용도 — momentum_rotation_loop.py 의 handle_control() 이 처리한 마지막 nonce.
    @JsonAlias("consumed_control_nonce") String consumedControlNonce) {

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Position(
      String side,
      @JsonAlias("entry_price") double entryPrice,
      @JsonAlias("mark_price") double markPrice,
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
      // 세션 = 마지막 리밸런스(정기 2~3일 자동 또는 수동 즉시매도 후 재진입) 이후 손익 — inception 이후
      // 누적치인 returnPct 와 달리 리밸런스마다 0으로 리셋된다. trading/app/momentum_rotation_loop.py
      // 의 _rebalance_live() 가 유일한 갱신 지점(자동/수동 공통).
      @JsonAlias("session_start_equity_usdt") double sessionStartEquityUsdt,
      @JsonAlias("session_start_ts") String sessionStartTs,
      @JsonAlias("session_pnl_usdt") double sessionPnlUsdt,
      @JsonAlias("session_return_pct") double sessionReturnPct,
      @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt,
      double drawdown,
      @JsonAlias("hwm_usdt") double hwmUsdt,
      double leverage,
      boolean halted,
      @JsonAlias("manual_flat") boolean manualFlat,
      @JsonAlias("manual_flat_ts") String manualFlatTs,
      Map<String, Position> positions) {}

  public record LogEntry(String ts, String message) {}

  public record EquityPoint(String ts, @JsonAlias("total_pnl_usdt") double totalPnlUsdt,
      @JsonAlias("equity_usdt") double equityUsdt, double drawdown) {}

  public record PositionPoint(String ts, double price, @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt) {}

  public static MomentumRotationState empty() {
    return new MomentumRotationState(
        Map.of(), List.of(), "paper", 0, 0, 0, 0, 0, 0, 0, false, null, null, null, null, null, List.of(), Map.of(), null);
  }
}
