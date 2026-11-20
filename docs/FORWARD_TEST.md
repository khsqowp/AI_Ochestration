# L5 4h PAPER forward test

This isolated service stores Binance public spot klines and synthetic PAPER fills in `trading-forward-test/forward.db`. It has no credentials, reads no `.env`, and has no order code. It maintains independent `combined`, `long_only`, and `short_only` books for BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT. The first run sets the forward start to the current UTC 4h boundary; older candles warm the full-history indicators only.

## Frozen configuration

Signal: `bb_depth_pct=0`, `bb_use=close`, `bb_window=4`, `stc_lag=4`, `stc_level=40`, `stc_lookback=5`, `stc_turn_type=1`, `stoch_cross_lag=4`, `stoch_level=30`, `stoch_min_cross_age=0`; all omitted signal knobs use `signal_frame()` defaults. Strict BB + stochastic + STC conjunction; long and short.

Management: 2 adds, 2% spacing, 1x add size, ATR(14) x 4 stop using ATR before entry, 2% target, 48-bar time stop, no BB-mid/opposite exit, 0.04% fee and 0.02% slippage per side, 1,000 notional per fill, 10,000 capital per book. Fills follow next-open and stop-first OHLC ordering. Research reference: 255 test trades over approximately 1.9 years and +20.6% summed across five symbols.

## Run and inspect

From the repository root, enable only the added profile when bringing up this service:

```sh
docker compose -f docker-compose.trading.yml --profile forward-test up -d --build trading-forward-test
./scripts/forward_test_status.sh
./scripts/forward_test_status.sh --json
./scripts/forward_test_status.sh --book long_only --since 2026-11-20 --trades 20
```

On a fresh Linux checkout, create the bind directory and give it to the image's non-root `app` user before starting the persistent container:

```sh
mkdir -p trading-forward-test
docker compose -f docker-compose.trading.yml --profile forward-test build trading-forward-test
docker compose -f docker-compose.trading.yml --profile forward-test run --rm --user root --entrypoint sh trading-forward-test -c 'chown -R app:app /app/data'
docker compose -f docker-compose.trading.yml --profile forward-test up -d trading-forward-test
```

The loop catches up on startup, then runs 20 seconds after each UTC 4h boundary. Inspect logs with `docker logs -f ochestration-trading-trading-forward-test-1`. A heartbeat older than 5 hours is `STALE`.

## Verdict and reset

`INSUFFICIENT DATA` remains until both 30 closed combined trades and 90 elapsed days. Thereafter, negative combined net return is `NEGATIVE`; otherwise fewer than half the historical-rate expected trades is `UNDERPERFORMING`; remaining cases are `ON TRACK`. Expected count scales 255 trades across 1.9 years by elapsed days. These are operational gates, not evidence of future profitability.

Stop only this service with `docker compose -f docker-compose.trading.yml --profile forward-test stop trading-forward-test`. To reset, stop it, back up or delete `trading-forward-test/forward.db` and `status.json`, then start it again. Reset sets a new forward start; it does not alter any other trading service.

## Implementation limits

The forward engine persists candles, signals, positions, trades, equity marks, runs, and heartbeat in SQLite. Full-history signals are recalculated from the stored candle history before advancing each symbol cursor. If a candle gap is found, the loop repairs it by refetching from the earliest gap. `live_ref_price` records the public ticker price at detection, falling back to the latest candle close if that ticker request fails.
