package com.orchestration.trading;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class BinanceDisplayServiceTest {
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void normalThirtySecondPollIntervalDoesNotMarkAccountStale() throws Exception {
    BinanceDisplayService service = serviceReturningAccount();
    service.account();
    await(() -> service.account().has("walletBalance"));

    assertFalse(service.account().path("accountStale").asBoolean());
    setField(service, "accountCache", cached(Instant.now().minusSeconds(30),
        mapper.readTree("{\"walletBalance\":12}")));
    assertFalse(service.account().path("accountStale").asBoolean());
  }

  @Test
  void hardTimeoutReleasesFlightAndEntersBackoffEvenWhenFetcherIgnoresInterrupts() throws Exception {
    CountDownLatch started = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    BinanceDisplayService service = new BinanceDisplayService(mapper, (path, params) -> {
      started.countDown();
      boolean finished = false;
      while (!finished) {
        try {
          finished = release.await(10, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
          // Model a transport that ignores cancellation and keeps occupying its worker.
        }
      }
      return mapper.readTree("{\"totalWalletBalance\":9}");
    }, 40, 40);

    service.account();
    assertTrue(started.await(1, TimeUnit.SECONDS));
    await(() -> getField(service, "accountFlight") == null);
    assertTrue((long) getField(service, "accountRetryAt") > System.currentTimeMillis());
    assertTrue(service.account().path("accountStale").asBoolean());
    release.countDown();
  }

  @Test
  void lateTimedOutWorkerCannotClearNewFlightOrOverwriteRecoveredCache() throws Exception {
    CountDownLatch oldStarted = new CountDownLatch(1);
    CountDownLatch releaseOld = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger();
    BinanceDisplayService service = new BinanceDisplayService(mapper, (path, params) -> {
      if (calls.incrementAndGet() == 1) {
        oldStarted.countDown();
        while (true) {
          try {
            if (releaseOld.await(10, TimeUnit.MILLISECONDS)) break;
          } catch (InterruptedException ignored) {
            // Deliberately ignore cancellation to exercise generation ownership.
          }
        }
        return mapper.readTree("{\"totalWalletBalance\":1}");
      }
      return mapper.readTree("{\"totalWalletBalance\":2,\"totalMarginBalance\":2}");
    }, 40, 40);

    service.account();
    assertTrue(oldStarted.await(1, TimeUnit.SECONDS));
    await(() -> getField(service, "accountFlight") == null);
    setField(service, "accountRetryAt", 0L);
    service.account();
    await(() -> service.accountCacheValue() != null);
    releaseOld.countDown();
    Thread.sleep(80);

    assertEquals(2, service.account().path("walletBalance").asDouble());
    assertNull(getField(service, "accountFlight"));
  }

  @Test
  void interruptIgnoringWorkersCannotGrowPastFourAndSaturationSkipsRefresh() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch started = new CountDownLatch(4);
    AtomicInteger calls = new AtomicInteger();
    BinanceDisplayService service = new BinanceDisplayService(mapper, (path, params) -> {
      calls.incrementAndGet();
      started.countDown();
      while (true) {
        try {
          if (release.await(10, TimeUnit.MILLISECONDS)) break;
        } catch (InterruptedException ignored) {
          // Hold each worker to exercise the executor's hard thread bound.
        }
      }
      return mapper.createObjectNode();
    }, 30, 30);

    for (int attempt = 0; attempt < 4; attempt++) {
      int expectedStarted = attempt + 1;
      service.account();
      await(() -> started.getCount() == 4 - expectedStarted);
      await(() -> getField(service, "accountFlight") == null);
      setField(service, "accountRetryAt", 0L);
    }
    service.account();

    assertEquals(4, calls.get());
    assertTrue((long) getField(service, "accountRetryAt") > System.currentTimeMillis());
    release.countDown();
  }

  @Test
  void failedRefreshMarksCachedValueStaleAndBacksOff() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    BinanceDisplayService service = new BinanceDisplayService(mapper, (path, params) -> {
      if (calls.incrementAndGet() == 1) {
        return mapper.readTree("{\"totalWalletBalance\":12,\"totalMarginBalance\":13}");
      }
      throw new IllegalStateException("offline");
    });
    service.account();
    await(() -> service.accountCacheValue() != null);
    setField(service, "accountCache", cached(Instant.now().minusSeconds(61),
        mapper.readTree("{\"walletBalance\":12}")));

    assertTrue(service.account().path("accountStale").asBoolean());
    await(() -> (long) getField(service, "accountRetryAt") > System.currentTimeMillis());
    assertTrue(service.account().path("accountStale").asBoolean());
    assertEquals(2, calls.get());
  }

  @Test
  void lateSuccessClearsStaleAfterRecovery() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    BinanceDisplayService service = new BinanceDisplayService(mapper, (path, params) -> {
      if (calls.incrementAndGet() == 1) throw new IllegalStateException("offline");
      return mapper.readTree("{\"totalWalletBalance\":15,\"totalMarginBalance\":16}");
    });
    service.account();
    await(() -> (long) getField(service, "accountRetryAt") > System.currentTimeMillis());
    assertTrue(service.account().path("accountStale").asBoolean());
    setField(service, "accountRetryAt", 0L);
    service.account();
    await(() -> service.accountCacheValue() != null && (long) getField(service, "accountRetryAt") == 0);

    assertFalse(service.account().path("accountStale").asBoolean());
    assertEquals(15, service.account().path("walletBalance").asDouble());
  }

  @Test
  void realizedRefreshReturnsTransfersAndHonorsTenPageLimitPerInterval() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    BinanceDisplayService service = new BinanceDisplayService(mapper, (path, params) -> {
      calls.incrementAndGet();
      long cursor = ((Number) params.get("startTime")).longValue();
      var page = mapper.createArrayNode();
      for (int index = 0; index < 1000; index++) {
        page.add(mapper.createObjectNode()
            .put("incomeType", index == 0 ? "TRANSFER" : "REALIZED_PNL")
            .put("income", index == 0 ? 5 : 1)
            .put("time", cursor + index + 1));
      }
      return page;
    });

    service.realized();
    await(() -> service.realizedCacheValue() != null);
    JsonNode value = service.realized();

    assertEquals(true, value.path("querySucceeded").asBoolean());
    assertTrue(value.path("transfers").isArray());
    assertTrue(value.path("transfers").size() > 0);
    assertTrue(calls.get() <= 130, "90-day window has at most 13 intervals x 10 pages");
    assertFalse(value.path("realizedStale").asBoolean());
  }

  private BinanceDisplayService serviceReturningAccount() {
    return new BinanceDisplayService(mapper, (path, params) ->
        mapper.readTree("{\"totalWalletBalance\":12,\"totalMarginBalance\":13,\"totalInitialMargin\":2}"));
  }

  private Object cached(Instant at, JsonNode value) throws Exception {
    Class<?> cachedClass = Class.forName(BinanceDisplayService.class.getName() + "$Cached");
    var constructor = cachedClass.getDeclaredConstructor(Instant.class, JsonNode.class);
    constructor.setAccessible(true);
    return constructor.newInstance(at, value);
  }

  private static void setField(Object target, String name, Object value) throws Exception {
    Field field = target.getClass().getDeclaredField(name);
    field.setAccessible(true);
    field.set(target, value);
  }

  private static Object getField(Object target, String name) throws Exception {
    Field field = target.getClass().getDeclaredField(name);
    field.setAccessible(true);
    return field.get(target);
  }

  private static void await(CheckedCondition condition) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
    while (!condition.isTrue() && System.nanoTime() < deadline) {
      Thread.sleep(5);
    }
    assertTrue(condition.isTrue(), "condition did not become true before deadline");
  }

  @FunctionalInterface
  private interface CheckedCondition {
    boolean isTrue() throws Exception;
  }
}
