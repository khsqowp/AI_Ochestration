package com.orchestration.trading;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.*;

/** Display-only calculations; never writes to the trading bot state. */
final class MomentumDisplayCalculations {
  private MomentumDisplayCalculations() {}
  static double sessionPnl(double equity, double start) { return equity - start; }
  static double sessionReturnPct(double pnl, double start) { return start == 0 ? 0 : pnl / start * 100; }
  static double correctedPnl(String ts, double pnl, double equity, double inception) {
    return correctedPnl(ts, pnl, equity, inception, 144.45);
  }
  static double correctedPnl(String ts, double pnl, double equity, double inception, double configuredInception) {
    Instant at = parse(ts);
    Instant from = Instant.parse("2026-10-12T05:52:00Z"), to = Instant.parse("2026-10-16T00:18:00Z");
    double base = Math.abs(inception - 144.45) < 1e-6 ? inception : configuredInception;
    return at != null && !at.isBefore(from) && at.isBefore(to) ? equity - base : pnl;
  }
  static double correctedDailyPnl(String day, double pnl, double inception) {
    return correctedDailyPnl(day, pnl, inception, 144.45);
  }
  static double correctedDailyPnl(String day, double pnl, double inception, double configuredInception) {
    Instant at = parse(day);
    // Daily points are end-of-day values: 10-12..10-15 are distorted, 10-16 EOD is already correct.
    Instant end = Instant.parse("2026-10-16T00:00:00Z");
    double base = Math.abs(inception - 144.45) < 1e-6 ? inception : configuredInception;
    return at != null && !at.isBefore(Instant.parse("2026-10-12T00:00:00Z")) && at.isBefore(end)
        ? pnl + (219.0 - base) : pnl;
  }
  static Map<String, Double> incomeByUtcDay(List<Income> rows) {
    Map<String, Double> out = new TreeMap<>();
    for (Income row : rows) if (Set.of("REALIZED_PNL", "COMMISSION", "FUNDING_FEE").contains(row.type())) {
      String day = Instant.ofEpochMilli(row.time()).atZone(ZoneOffset.UTC).toLocalDate().toString();
      out.merge(day, row.income(), Double::sum);
    }
    return out;
  }
  static double marginUtilization(Double initial, Double balance) {
    return initial == null || balance == null || balance <= 0 ? Double.NaN : initial / balance;
  }
  private static Instant parse(String ts) { try { return Instant.parse(ts); } catch (DateTimeParseException e) { try { return OffsetDateTime.parse(ts).toInstant(); } catch (Exception ignored) { try { return LocalDate.parse(ts).atStartOfDay(ZoneOffset.UTC).toInstant(); } catch (Exception invalid) { return null; } } } }
  record Income(String type, double income, long time) {}
}
