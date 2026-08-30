package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import java.util.List;
import java.util.Map;

/**
 * trading-trx-swing 컨테이너(trading/app/trx_swing_state.py)가 공유 볼륨에 쓰는
 * trx_swing_state.json 구조를 읽어들이되, API 응답은 프런트엔드 관례에 맞춰 camelCase로 내려준다.
 * 펀딩비 차익거래 자금을 이어받은 임시 실계좌 전략 — 포지션은 최대 1개(단일 종목, 분할 없음)라
 * 다른 트레이딩 상태와 달리 Map이 아니라 nullable 단일 필드다.
 */
public record TrxTradingState(
    Position position,
    @JsonAlias("trade_log") List<LogEntry> tradeLog,
    @JsonAlias("cumulative_realized_pnl_usdt") double cumulativeRealizedPnlUsdt,
    @JsonAlias("cumulative_fee_usdt") double cumulativeFeeUsdt,
    @JsonAlias("inception_ts") String inceptionTs,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory,
    @JsonAlias("position_history") Map<String, List<PositionPoint>> positionHistory) {

  public record Position(
      @JsonAlias("entry_price") double entryPrice,
      double qty,
      @JsonAlias("notional_usdt") double notionalUsdt,
      @JsonAlias("entry_fee_usdt") double entryFeeUsdt) {}

  public record LogEntry(String ts, String message) {}

  public record EquityPoint(String ts, @JsonAlias("total_pnl_usdt") double totalPnlUsdt) {}

  public record PositionPoint(String ts, double price, @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt) {}

  public static TrxTradingState empty() {
    return new TrxTradingState(null, List.of(), 0, 0, null, List.of(), Map.of());
  }
}
