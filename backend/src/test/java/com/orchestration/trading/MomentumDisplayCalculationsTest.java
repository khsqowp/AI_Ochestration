package com.orchestration.trading;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class MomentumDisplayCalculationsTest {
  @Test void entryCapitalSumsNetTransfersAndUsesFallbackWithoutTransfers() {
    var rows = List.of(new MomentumDisplayCalculations.Income("TRANSFER",35,1), new MomentumDisplayCalculations.Income("TRANSFER",35,2), new MomentumDisplayCalculations.Income("TRANSFER",74.01,3));
    assertEquals(144.01, MomentumDisplayCalculations.entryCapital(rows, 100), 1e-8);
    assertEquals(0, MomentumDisplayCalculations.entryCapital(List.of(), 100));
    assertEquals(100, MomentumDisplayCalculations.entryCapital(null, 100));
  }
  @Test void sessionPnlMatchesUnrealizedAndUsesPreUnrealizedEquityAsBasis() {
    assertEquals(4.47, MomentumDisplayCalculations.sessionPnl(4.47), 1e-8);
    assertEquals(4.47 / (200 - 4.47) * 100, MomentumDisplayCalculations.sessionReturnPct(4.47, 200), 1e-8);
  }
  @Test void rollingWeekRemovesNetTransferAndUsesOldestPointWhenHistoryIsShort() {
    long now = 1_800_000_000_000L;
    var history = List.of(new MomentumRotationState.EquityPoint(java.time.Instant.ofEpochMilli(now-5*86400000L).toString(), 0,100,0));
    var transfers = List.of(new MomentumDisplayCalculations.Income("TRANSFER",20,now-3*86400000L));
    var result = MomentumDisplayCalculations.rollingPeriod(history, 125, 100, now, 7*86400000L, transfers);
    assertEquals(5, result.pnl(), 1e-8);
    assertEquals(5.0/120*100, result.returnPct(), 1e-8);
    assertEquals(java.time.Instant.ofEpochMilli(now-5*86400000L).toString(), result.basisTs());
    assertTrue(result.shortHistory());
  }
  @Test void roeUsesMarginAndPriceReturnUsesNotional() {
    assertEquals(52.8994, MomentumDisplayCalculations.positionRoePct(4.47,33.80,4), 0.01);
    assertEquals(13.2249, MomentumDisplayCalculations.positionPriceReturnPct(4.47,33.80), 0.01);
  }
  @Test void correctionOnlyAppliesInRequestedUtcSegment() { assertEquals(-24.45, MomentumDisplayCalculations.correctedPnl("2026-10-13T00:00:00Z", 75,120,219), 1e-8); assertEquals(75, MomentumDisplayCalculations.correctedPnl("2026-10-16T00:19:00Z",75,120,219)); }
  @Test void dailyCorrectionAddsOffsetOnlyForAffectedDays() { assertEquals(-8.96111, MomentumDisplayCalculations.correctedDailyPnl("2026-10-12", -83.51111,144.45),1e-8); assertEquals(-8.17, MomentumDisplayCalculations.correctedDailyPnl("2026-10-16",-8.17,144.45)); }
  @Test void aggregatesAllowedIncomeByUtcDay() { var rows=List.of(new MomentumDisplayCalculations.Income("REALIZED_PNL",4,1798761600000L),new MomentumDisplayCalculations.Income("COMMISSION",-1,1798761600000L),new MomentumDisplayCalculations.Income("OTHER",99,1798761600000L)); assertEquals(3, MomentumDisplayCalculations.incomeByUtcDay(rows).values().iterator().next()); }
  @Test void computesMarginUtilizationAndGuardsMissingBalance() { assertEquals(.95, MomentumDisplayCalculations.marginUtilization(95d,100d)); assertTrue(Double.isNaN(MomentumDisplayCalculations.marginUtilization(95d,0d))); }
}
