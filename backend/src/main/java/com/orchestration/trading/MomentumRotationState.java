package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import java.util.List;
import java.util.Map;

/**
 * trading-momentum-rotation 컨테이너(trading/app/momentum_state.py)가 공유 볼륨에 쓰는
 * momentum_rotation_state.json 구조를 읽어들이되, API 응답은 프런트엔드 관례에 맞춰
 * camelCase로 내려준다. 실주문 없는 백테스트/페이퍼 모드 전략이라 실계좌 잔고 필드는 없다.
 */
public record MomentumRotationState(
    Map<String, Position> positions,
    @JsonAlias("trade_log") List<LogEntry> tradeLog,
    @JsonAlias("equity_usdt") double equityUsdt,
    @JsonAlias("cumulative_realized_pnl_usdt") double cumulativeRealizedPnlUsdt,
    @JsonAlias("cumulative_fee_usdt") double cumulativeFeeUsdt,
    @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt,
    @JsonAlias("inception_ts") String inceptionTs,
    @JsonAlias("last_rebalance_ts") String lastRebalanceTs,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory) {

  public record Position(
      String side,
      @JsonAlias("entry_price") double entryPrice,
      @JsonAlias("notional_usdt") double notionalUsdt,
      @JsonAlias("unrealized_pnl_usdt") double unrealizedPnlUsdt) {}

  public record LogEntry(String ts, String message) {}

  public record EquityPoint(String ts, @JsonAlias("total_pnl_usdt") double totalPnlUsdt) {}

  public static MomentumRotationState empty() {
    return new MomentumRotationState(Map.of(), List.of(), 0, 0, 0, 0, null, null, List.of());
  }
}
