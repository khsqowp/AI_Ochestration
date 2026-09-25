package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/**
 * trading-coin-swing6 컨테이너(trading/app/coin_swing6_state.py)가 공유 볼륨에 쓰는
 * coin_swing6_state.json 구조. 완전 페이퍼(가상자본) 봇 — 종목당 슬롯 1개씩 최대 6개 동시
 * 보유, 레버리지 없음, 리밸런스/세션 개념 없음(momentum-rotation과 달리 broker 없음).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CoinSwing6State(
    Map<String, Position> positions,
    @JsonAlias("trade_log") List<LogEntry> tradeLog,
    @JsonAlias("cumulative_realized_pnl_usdt") double cumulativeRealizedPnlUsdt,
    @JsonAlias("equity_usdt") double equityUsdt,
    @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt,
    @JsonAlias("inception_ts") String inceptionTs,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory,
    @JsonAlias("position_history") Map<String, List<PositionPoint>> positionHistory) {

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Position(
      String side,
      @JsonAlias("entry_price") double entryPrice,
      @JsonAlias("notional_usdt") double notionalUsdt,
      @JsonAlias("opened_ts") String openedTs,
      @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt) {}

  public record LogEntry(String ts, String message) {}

  public record EquityPoint(String ts, @JsonAlias("total_pnl_usdt") double totalPnlUsdt) {}

  public record PositionPoint(String ts, double price, @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt) {}

  public static CoinSwing6State empty() {
    return new CoinSwing6State(Map.of(), List.of(), 0, 0, 0, null, List.of(), Map.of());
  }
}
