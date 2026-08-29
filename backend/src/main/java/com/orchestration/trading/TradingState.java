package com.orchestration.trading;

import com.fasterxml.jackson.annotation.JsonAlias;
import java.util.List;
import java.util.Map;

/**
 * trading/app/paper_state.py가 쓰는 funding_arb_state.json(snake_case) 구조를 읽어들이되,
 * API 응답은 프런트엔드 관례에 맞춰 camelCase로 내려준다 — @JsonAlias는 역직렬화(읽기)에만
 * 적용되고 직렬화(응답) 시 필드명은 레코드 컴포넌트 이름(camelCase)을 그대로 쓴다.
 */
public record TradingState(
    Map<String, Position> positions,
    @JsonAlias("trade_log") List<LogEntry> tradeLog,
    @JsonAlias("cumulative_funding_usdt") double cumulativeFundingUsdt,
    @JsonAlias("cumulative_fee_usdt") double cumulativeFeeUsdt,
    // 현물 롱 + 선물 숏이 실제로는 서로 다른 오더북이라 완벽히 상쇄되지 않을 수 있다 — 이 두 필드는
    // 펀딩비 수취와 별개로, 그 가격 괴리(베이시스)·체결 슬리피지에서 실제로 나는 손익을 담는다.
    @JsonAlias("cumulative_price_pnl_usdt") double cumulativePricePnlUsdt,
    @JsonAlias("unrealized_price_pnl_usdt") double unrealizedPricePnlUsdt,
    @JsonAlias("realized_pnl_usdt") double realizedPnlUsdt,
    @JsonAlias("inception_ts") String inceptionTs,
    @JsonAlias("total_capital_usdt") double totalCapitalUsdt,
    @JsonAlias("total_pnl_usdt") double totalPnlUsdt,
    @JsonAlias("equity_history") List<EquityPoint> equityHistory,
    @JsonAlias("trading_halted") boolean tradingHalted) {

  public record Position(
      @JsonAlias("notional_usdt") double notionalUsdt,
      @JsonAlias("entry_price") double entryPrice,
      @JsonAlias("entry_spot_price") double entrySpotPrice,
      @JsonAlias("entry_perp_price") double entryPerpPrice,
      double amount,
      @JsonAlias("entry_fee_usdt") double entryFeeUsdt,
      @JsonAlias("accrued_funding_usdt") double accruedFundingUsdt,
      @JsonAlias("unrealized_price_pnl_usdt") double unrealizedPricePnlUsdt) {}

  public record LogEntry(String ts, String message) {}

  public record EquityPoint(String ts, @JsonAlias("total_pnl_usdt") double totalPnlUsdt) {}

  public static TradingState empty() {
    return new TradingState(Map.of(), List.of(), 0, 0, 0, 0, 0, null, 0, 0, List.of(), false);
  }
}
