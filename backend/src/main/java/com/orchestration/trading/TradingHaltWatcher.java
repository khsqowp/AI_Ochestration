package com.orchestration.trading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestration.n8n.N8nDispatcher;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * trading-paper-funding-arb writes its state file whenever it acts; nobody watches for the
 * {@code tradingHalted} flag flipping unless they happen to open the trading dashboard. Polls the same
 * state file {@link TradingStateController} reads and fires a Slack alert on the false→true transition
 * only (not every poll while still halted), so a single incident doesn't spam the channel every cycle.
 */
@Service
public class TradingHaltWatcher {
  private static final Logger log = LoggerFactory.getLogger(TradingHaltWatcher.class);
  private final Path statePath;
  private final ObjectMapper objectMapper;
  private final N8nDispatcher dispatcher;
  private boolean lastKnownHalted = false;

  TradingHaltWatcher(
      @Value("${app.trading.state-path:/workspace/trading-state/funding_arb_state.json}") String statePath,
      ObjectMapper objectMapper, N8nDispatcher dispatcher) {
    this.statePath = Path.of(statePath);
    this.objectMapper = objectMapper;
    this.dispatcher = dispatcher;
  }

  @Scheduled(fixedDelayString = "${app.trading.halt-check-delay-ms:120000}")
  void checkHalted() {
    if (!Files.exists(statePath)) return;
    TradingState state;
    try {
      state = objectMapper.readValue(Files.readString(statePath), TradingState.class);
    } catch (Exception exception) {
      log.warn("trading_halt_check_failed", exception);
      return;
    }
    if (state.tradingHalted() && !lastKnownHalted) {
      dispatcher.dispatchTradingHalted(state.totalPnlUsdt(), state.totalCapitalUsdt());
    }
    lastKnownHalted = state.tradingHalted();
  }
}
