package com.orchestration.trading;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class MomentumDisplayCalculationsTest {
  @Test void sessionPnlUsesStartEquity() { assertEquals(3, MomentumDisplayCalculations.sessionPnl(123,120)); assertEquals(2.5, MomentumDisplayCalculations.sessionReturnPct(3,120)); }
  @Test void correctionOnlyAppliesInRequestedUtcSegment() { assertEquals(-24.45, MomentumDisplayCalculations.correctedPnl("2026-10-13T00:00:00Z", 75,120,219), 1e-8); assertEquals(75, MomentumDisplayCalculations.correctedPnl("2026-10-16T00:19:00Z",75,120,219)); }
  @Test void dailyCorrectionAddsOffsetOnlyForAffectedDays() { assertEquals(-8.96111, MomentumDisplayCalculations.correctedDailyPnl("2026-10-12", -83.51111,144.45),1e-8); assertEquals(-8.17, MomentumDisplayCalculations.correctedDailyPnl("2026-10-16",-8.17,144.45)); }
  @Test void aggregatesAllowedIncomeByUtcDay() { var rows=List.of(new MomentumDisplayCalculations.Income("REALIZED_PNL",4,1798761600000L),new MomentumDisplayCalculations.Income("COMMISSION",-1,1798761600000L),new MomentumDisplayCalculations.Income("OTHER",99,1798761600000L)); assertEquals(3, MomentumDisplayCalculations.incomeByUtcDay(rows).values().iterator().next()); }
  @Test void computesMarginUtilizationAndGuardsMissingBalance() { assertEquals(.95, MomentumDisplayCalculations.marginUtilization(95d,100d)); assertTrue(Double.isNaN(MomentumDisplayCalculations.marginUtilization(95d,0d))); }
}
