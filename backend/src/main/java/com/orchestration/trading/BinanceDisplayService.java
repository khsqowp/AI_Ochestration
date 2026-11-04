package com.orchestration.trading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

/** Read-only Binance account display cache. Request threads never perform network I/O. */
@Service
class BinanceDisplayService {
  @FunctionalInterface
  interface Fetcher {
    JsonNode fetch(String path, Map<String, ?> params) throws Exception;
  }

  private static final HttpClient HTTP =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  private static final long ACCOUNT_TTL_MILLIS = TimeUnit.SECONDS.toMillis(20);
  private static final long INCOME_TTL_MILLIS = TimeUnit.HOURS.toMillis(1);
  private static final long ACCOUNT_STALE_MILLIS = ACCOUNT_TTL_MILLIS * 3;
  private static final long INCOME_STALE_MILLIS = INCOME_TTL_MILLIS * 3;
  private static final long RETRY_BACKOFF_MILLIS = TimeUnit.SECONDS.toMillis(60);
  private static final int MAX_REFRESH_WORKERS = 4;

  private final ObjectMapper mapper;
  private final Fetcher fetcher;
  private final long accountTimeoutMillis;
  private final long incomeTimeoutMillis;
  private final ThreadPoolExecutor workers = new ThreadPoolExecutor(
      0, MAX_REFRESH_WORKERS, 30, TimeUnit.SECONDS, new java.util.concurrent.SynchronousQueue<>(),
      daemonFactory("binance-display-refresh"), new ThreadPoolExecutor.AbortPolicy());
  private final ScheduledExecutorService timeouts =
      java.util.concurrent.Executors.newSingleThreadScheduledExecutor(
          daemonFactory("binance-display-timeout"));
  private volatile Cached accountCache;
  private volatile Cached incomeCache;
  private volatile long accountRetryAt;
  private volatile long incomeRetryAt;
  private Flight accountFlight;
  private Flight incomeFlight;

  @org.springframework.beans.factory.annotation.Autowired
  BinanceDisplayService(ObjectMapper mapper) {
    this(mapper, null, TimeUnit.SECONDS.toMillis(10), TimeUnit.SECONDS.toMillis(60));
  }

  BinanceDisplayService(ObjectMapper mapper, Fetcher fetcher) {
    this(mapper, fetcher, TimeUnit.SECONDS.toMillis(10), TimeUnit.SECONDS.toMillis(60));
  }

  BinanceDisplayService(ObjectMapper mapper, Fetcher fetcher, long accountTimeoutMillis,
      long incomeTimeoutMillis) {
    this.mapper = mapper;
    this.fetcher = fetcher == null ? this::request : fetcher;
    this.accountTimeoutMillis = accountTimeoutMillis;
    this.incomeTimeoutMillis = incomeTimeoutMillis;
  }

  JsonNode account() {
    Cached snapshot = accountCache;
    pollAccount();
    return response(snapshot, "account", ACCOUNT_STALE_MILLIS, accountRetryAt);
  }

  JsonNode realized() {
    Cached snapshot = incomeCache;
    pollIncome();
    return response(snapshot, "realized", INCOME_STALE_MILLIS, incomeRetryAt);
  }

  JsonNode accountCacheValue() {
    Cached cached = accountCache;
    return cached == null ? null : cached.value;
  }

  JsonNode realizedCacheValue() {
    Cached cached = incomeCache;
    return cached == null ? null : cached.value;
  }

  private synchronized void pollAccount() {
    if (accountFlight != null || System.currentTimeMillis() < accountRetryAt
        || isFresh(accountCache, ACCOUNT_TTL_MILLIS)) {
      return;
    }
    Flight flight = new Flight();
    accountFlight = flight;
    submit(flight, true, () -> {
      JsonNode source = fetcher.fetch("/fapi/v2/account", Map.of());
      JsonNode value = mapper.createObjectNode()
          .put("walletBalance", source.path("totalWalletBalance").asDouble())
          .put("marginBalance", source.path("totalMarginBalance").asDouble())
          .put("initialMargin", source.path("totalInitialMargin").asDouble());
      return value;
    });
  }

  private synchronized void pollIncome() {
    if (incomeFlight != null || System.currentTimeMillis() < incomeRetryAt
        || isFresh(incomeCache, INCOME_TTL_MILLIS)) {
      return;
    }
    Flight flight = new Flight();
    incomeFlight = flight;
    submit(flight, false, this::loadIncome);
  }

  private void submit(Flight flight, boolean account, CheckedSupplier task) {
    try {
      flight.worker = workers.submit(() -> {
        try {
          JsonNode value = task.get();
          synchronized (this) {
            if (currentFlight(account) == flight) {
              Cached cached = new Cached(Instant.now(), value);
              if (account) {
                accountCache = cached;
              } else {
                incomeCache = cached;
              }
              retryAt(account, 0);
            }
          }
        } catch (Exception failure) {
          synchronized (this) {
            if (currentFlight(account) == flight) {
              retryAt(account, System.currentTimeMillis() + RETRY_BACKOFF_MILLIS);
            }
          }
        } finally {
          if (flight.timeout != null) {
            flight.timeout.cancel(false);
          }
          synchronized (this) {
            if (currentFlight(account) == flight) {
              setFlight(account, null);
            }
          }
        }
      });
      long timeoutMillis = account ? accountTimeoutMillis : incomeTimeoutMillis;
      flight.timeout = timeouts.schedule(() -> timeout(flight, account), timeoutMillis,
          TimeUnit.MILLISECONDS);
    } catch (RejectedExecutionException saturated) {
      synchronized (this) {
        if (currentFlight(account) == flight) {
          retryAt(account, System.currentTimeMillis() + RETRY_BACKOFF_MILLIS);
          setFlight(account, null);
        }
      }
    }
  }

  private void timeout(Flight flight, boolean account) {
    synchronized (this) {
      if (currentFlight(account) != flight) {
        return;
      }
      retryAt(account, System.currentTimeMillis() + RETRY_BACKOFF_MILLIS);
      setFlight(account, null);
    }
    flight.worker.cancel(true);
  }

  private synchronized Flight currentFlight(boolean account) {
    return account ? accountFlight : incomeFlight;
  }

  private void setFlight(boolean account, Flight flight) {
    if (account) {
      accountFlight = flight;
    } else {
      incomeFlight = flight;
    }
  }

  private void retryAt(boolean account, long value) {
    if (account) {
      accountRetryAt = value;
    } else {
      incomeRetryAt = value;
    }
  }

  private boolean isFresh(Cached cached, long ttlMillis) {
    return cached != null && cached.at.toEpochMilli() + ttlMillis > System.currentTimeMillis();
  }

  private JsonNode loadIncome() throws Exception {
    long now = System.currentTimeMillis();
    long start = now - 90L * 86_400_000;
    List<MomentumDisplayCalculations.Income> all = new ArrayList<>();
    for (long intervalStart = start; intervalStart < now; intervalStart += 7L * 86_400_000) {
      long intervalEnd = Math.min(now, intervalStart + 7L * 86_400_000 - 1);
      long cursor = intervalStart;
      int pages = 0;
      while (cursor <= intervalEnd && pages < 10) {
        pages++;
        JsonNode page = fetcher.fetch("/fapi/v1/income", Map.of(
            "startTime", cursor, "endTime", intervalEnd, "limit", 1000));
        if (!page.isArray() || page.isEmpty()) {
          break;
        }
        long last = cursor;
        for (JsonNode row : page) {
          long timestamp = row.path("time").asLong();
          all.add(new MomentumDisplayCalculations.Income(
              row.path("incomeType").asText(), row.path("income").asDouble(), timestamp));
          last = Math.max(last, timestamp + 1);
        }
        if (page.size() < 1000 || last <= cursor) {
          break;
        }
        cursor = last;
      }
    }
    Map<String, Double> daily = MomentumDisplayCalculations.incomeByUtcDay(all);
    double realized7d = sumSince(daily, now - 7L * 86_400_000);
    double realized30d = sumSince(daily, now - 30L * 86_400_000);
    var value = mapper.createObjectNode()
        .put("realized7d", realized7d)
        .put("realized30d", realized30d)
        .put("realized3m", daily.values().stream().mapToDouble(Double::doubleValue).sum());
    value.set("daily", mapper.valueToTree(daily));
    value.put("querySucceeded", true);
    value.set("transfers", mapper.valueToTree(all.stream()
        .filter(income -> "TRANSFER".equals(income.type()))
        .map(income -> Map.of("time", income.time(), "income", income.income()))
        .toList()));
    return value;
  }

  private double sumSince(Map<String, Double> daily, long since) {
    String day = Instant.ofEpochMilli(since).toString().substring(0, 10);
    return daily.entrySet().stream()
        .filter(entry -> entry.getKey().compareTo(day) >= 0)
        .mapToDouble(Map.Entry::getValue).sum();
  }

  private JsonNode response(Cached cached, String key, long staleMillis, long retryAt) {
    var result = cached == null ? mapper.createObjectNode()
        : (com.fasterxml.jackson.databind.node.ObjectNode) cached.value.deepCopy();
    boolean stale = cached == null || cached.at.toEpochMilli() + staleMillis < System.currentTimeMillis()
        || retryAt > System.currentTimeMillis();
    result.put(key + "Stale", stale);
    if (cached == null) {
      result.putNull(key + "AsOf");
    } else {
      result.put(key + "AsOf", cached.at.toString());
    }
    return result;
  }

  private JsonNode request(String path, Map<String, ?> params) throws Exception {
    String key = System.getenv("BINANCE_API_KEY");
    String secret = System.getenv("BINANCE_SECRET_KEY");
    if (key == null || key.isBlank() || secret == null || secret.isBlank()) {
      throw new IllegalStateException("credentials unavailable");
    }
    Map<String, String> all = new TreeMap<>();
    params.forEach((name, value) -> all.put(name, String.valueOf(value)));
    all.put("timestamp", String.valueOf(System.currentTimeMillis()));
    all.put("recvWindow", "5000");
    String query = String.join("&", all.entrySet().stream()
        .map(entry -> entry.getKey() + "=" + entry.getValue()).toList());
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    String signature = HexFormat.of().formatHex(mac.doFinal(query.getBytes(StandardCharsets.UTF_8)));
    HttpRequest request = HttpRequest.newBuilder(
            URI.create("https://fapi.binance.com" + path + "?" + query + "&signature=" + signature))
        .header("X-MBX-APIKEY", key)
        .timeout(Duration.ofSeconds(8))
        .GET().build();
    HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() != 200) {
      throw new IllegalStateException("Binance read failed");
    }
    return mapper.readTree(response.body());
  }

  private static ThreadFactory daemonFactory(String name) {
    return runnable -> {
      Thread thread = new Thread(runnable, name);
      thread.setDaemon(true);
      return thread;
    };
  }

  @FunctionalInterface
  private interface CheckedSupplier {
    JsonNode get() throws Exception;
  }

  private record Cached(Instant at, JsonNode value) {}

  private static final class Flight {
    private volatile Future<?> worker;
    private volatile java.util.concurrent.ScheduledFuture<?> timeout;

    private Flight() {}
  }
}
