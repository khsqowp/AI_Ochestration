package com.orchestration.trading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

/** Read-only Binance USD-M account and income data for dashboard display. */
@Service
class BinanceDisplayService {
  private final ObjectMapper mapper;
  private volatile Cached accountCache, incomeCache;
  BinanceDisplayService(ObjectMapper mapper) { this.mapper = mapper; }
  synchronized JsonNode account() {
    if (accountCache != null && accountCache.at.plusSeconds(20).isAfter(Instant.now())) return accountCache.value;
    try { JsonNode n = request("/fapi/v2/account", Map.of()); JsonNode v = mapper.createObjectNode().put("walletBalance", n.path("totalWalletBalance").asDouble()).put("marginBalance", n.path("totalMarginBalance").asDouble()).put("initialMargin", n.path("totalInitialMargin").asDouble()); accountCache = new Cached(Instant.now(), v); return v; }
    catch (Exception e) { return accountCache == null ? mapper.createObjectNode() : accountCache.value; }
  }
  synchronized JsonNode realized() {
    if (incomeCache != null && incomeCache.at.plusSeconds(3600).isAfter(Instant.now())) return incomeCache.value;
    try {
      long now = System.currentTimeMillis(), start = now - 90L * 86400000; // 고정 룩백(바이낸스 income은 최근 3개월만 지원). inception과 무관
      List<MomentumDisplayCalculations.Income> all = new ArrayList<>();
      for (long a = start; a < now; a += 7L * 86400000) {
        long b = Math.min(now, a + 7L * 86400000 - 1);
        long cursor = a;
        while (cursor <= b) {
          JsonNode page = request("/fapi/v1/income", Map.of("startTime", cursor, "endTime", b, "limit", 1000));
          if (!page.isArray() || page.isEmpty()) break;
          long last = cursor;
          for (JsonNode row : page) { all.add(new MomentumDisplayCalculations.Income(row.path("incomeType").asText(), row.path("income").asDouble(), row.path("time").asLong())); last = Math.max(last, row.path("time").asLong() + 1); }
          if (page.size() < 1000 || last <= cursor) break; cursor = last;
        }
      }
      Map<String, Double> days = MomentumDisplayCalculations.incomeByUtcDay(all);
      double d7 = sumSince(days, now - 7L*86400000), d30 = sumSince(days, now - 30L*86400000);
      var value = mapper.createObjectNode().put("realized7d", d7).put("realized30d", d30).put("realized3m", days.values().stream().mapToDouble(Double::doubleValue).sum());
      value.set("daily", mapper.valueToTree(days));
      value.put("querySucceeded", true);
      value.set("transfers", mapper.valueToTree(all.stream().filter(i -> "TRANSFER".equals(i.type())).map(i -> Map.of("time", i.time(), "income", i.income())).toList()));
      JsonNode v = value;
      incomeCache = new Cached(Instant.now(), v); return v;
    } catch (Exception e) { return incomeCache == null ? mapper.createObjectNode() : incomeCache.value; }
  }
  private double sumSince(Map<String,Double> days, long since) { String day = Instant.ofEpochMilli(since).toString().substring(0,10); return days.entrySet().stream().filter(e -> e.getKey().compareTo(day)>=0).mapToDouble(Map.Entry::getValue).sum(); }
  private JsonNode request(String path, Map<String, ?> params) throws Exception {
    String key = System.getenv("BINANCE_API_KEY"), secret = System.getenv("BINANCE_SECRET_KEY");
    if (key == null || key.isBlank() || secret == null || secret.isBlank()) throw new IllegalStateException("credentials unavailable");
    Map<String,String> all = new TreeMap<>(); params.forEach((k,v)->all.put(k,String.valueOf(v))); all.put("timestamp", String.valueOf(System.currentTimeMillis())); all.put("recvWindow","5000");
    String query = String.join("&", all.entrySet().stream().map(e -> e.getKey()+"="+e.getValue()).toList());
    Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256")); String sig=HexFormat.of().formatHex(mac.doFinal(query.getBytes(StandardCharsets.UTF_8)));
    HttpRequest req=HttpRequest.newBuilder(URI.create("https://fapi.binance.com"+path+"?"+query+"&signature="+sig)).header("X-MBX-APIKEY",key).timeout(java.time.Duration.ofSeconds(8)).GET().build();
    HttpResponse<String> res=HttpClient.newHttpClient().send(req,HttpResponse.BodyHandlers.ofString()); if(res.statusCode()!=200) throw new IllegalStateException("Binance read failed"); return mapper.readTree(res.body());
  }
  private record Cached(Instant at, JsonNode value) {}
}
