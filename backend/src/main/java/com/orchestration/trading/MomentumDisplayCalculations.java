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
  static double sessionPnl(double unrealized) { return unrealized; }
  static double sessionReturnPct(double unrealized, double equity) { double basis = equity - unrealized; return basis <= 0 ? 0 : unrealized / basis * 100; }
  static double entryCapital(List<Income> rows, double fallback) {
    if (rows == null) return fallback;
    return rows.stream().filter(row -> "TRANSFER".equals(row.type())).mapToDouble(Income::income).sum();
  }
  /** 진입금액 = 기준값(기준 시각까지의 순입금 합계) + 기준 시각 이후 TRANSFER 순합. 조회 룩백과 무관. */
  static double entryCapitalFromBaseline(double baseline, long baselineMillis, List<Income> rows) {
    if (rows == null) return baseline;
    return baseline + rows.stream().filter(r -> "TRANSFER".equals(r.type()) && r.time() > baselineMillis).mapToDouble(Income::income).sum();
  }
  static double positionRoePct(double pnl, double notional, double leverage) {
    double lev = leverage > 0 ? leverage : 4;
    double margin = Math.abs(notional) / lev;
    return margin == 0 ? 0 : pnl / margin * 100;
  }
  static double positionPriceReturnPct(double pnl, double notional) { return notional == 0 ? 0 : pnl / Math.abs(notional) * 100; }
  static PeriodResult rollingPeriod(List<MomentumRotationState.EquityPoint> history, double currentEquity,
      double inceptionEquity, long now, long durationMillis, List<Income> rows) {
    if (history == null || history.isEmpty()) return new PeriodResult(0, 0, null, true);
    long target = now - durationMillis;
    MomentumRotationState.EquityPoint base = history.stream().filter(p -> {
      Instant ts = parse(p.ts()); return ts != null && ts.toEpochMilli() <= target;
    }).max(Comparator.comparing(p -> parse(p.ts()))).orElseGet(() -> history.stream()
      .min(Comparator.comparing(p -> Optional.ofNullable(parse(p.ts())).orElse(Instant.MAX))).orElse(null));
    if (base == null) return new PeriodResult(0, 0, null, true);
    Instant baseTime = parse(base.ts());
    double transfer = rows == null ? 0 : rows.stream().filter(r -> "TRANSFER".equals(r.type()) && r.time() > baseTime.toEpochMilli() && r.time() <= now).mapToDouble(Income::income).sum();
    double baseEquity = base.equityUsdt() > 0 ? base.equityUsdt() : inceptionEquity + base.totalPnlUsdt();
    double adjustedBasis = baseEquity + transfer;
    double pnl = currentEquity - baseEquity - transfer;
    return new PeriodResult(pnl, adjustedBasis <= 0 ? 0 : pnl / adjustedBasis * 100, base.ts(), baseTime.toEpochMilli() > target);
  }
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
  record PeriodResult(double pnl, double returnPct, String basisTs, boolean shortHistory) {}
}
