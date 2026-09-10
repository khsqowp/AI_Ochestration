package com.orchestration.access;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DataIntegrityViolationException;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resolves visitor IPs to a point on the map. Priority:
 * <ol>
 *   <li>Cloudflare visitor-location headers ({@code CF-IPLatitude/Longitude/City/Region}) — needs the
 *       free "Add visitor location headers" Managed Transform enabled on the zone. Most accurate.</li>
 *   <li>ip-api.com batch lookup (free, no key, HTTP only) — city-level, backfilled on a schedule.</li>
 *   <li>Private / loopback → {@code "local"}, never mapped.</li>
 * </ol>
 */
@Service
public class GeoLocator {
  private static final Logger log = LoggerFactory.getLogger(GeoLocator.class);
  private static final String IPAPI_BATCH =
      "http://ip-api.com/batch?fields=status,country,countryCode,region,regionName,city,lat,lon,isp,org,query";

  private final IpLocationRepository locations;
  private final AccessEventRepository events;
  private final ObjectMapper json = new ObjectMapper();
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  GeoLocator(IpLocationRepository locations, AccessEventRepository events) {
    this.locations = locations;
    this.events = events;
  }

  /** Called from the request path (via the async record) — cheap, only writes when CF actually gave
   * coordinates and we don't already have a CF-accuracy row for this IP. */
  public void note(String ip, String cfLat, String cfLon, String cfCity, String cfRegion, String cfCountry) {
    if (ip == null || ip.isBlank()) return;
    IpLocation existing = locations.get(ip);
    if (existing != null && "cf".equals(existing.getAccuracy())) return;

    if (isPrivate(ip)) {
      if (existing == null) saveIgnoringRace(newLocal(ip));
      return;
    }

    Double lat = parseDouble(cfLat);
    Double lon = parseDouble(cfLon);
    if (lat == null || lon == null) return; // leave for ip-api backfill

    IpLocation loc = existing != null ? existing : new IpLocation(ip);
    String country = blankToNull(cfCountry);
    loc.set(country, country, blankToNull(cfRegion), blankToNull(cfCity), lat, lon, null, null, "cf");
    saveIgnoringRace(loc);
  }

  private static IpLocation newLocal(String ip) {
    IpLocation loc = new IpLocation(ip);
    loc.set(null, "로컬", null, null, 0, 0, null, null, "local");
    return loc;
  }

  private void saveIgnoringRace(IpLocation loc) {
    try {
      locations.save(loc);
    } catch (DataIntegrityViolationException e) {
      // another request inserted this IP between our read and write — fine, the row exists
    }
  }

  @Scheduled(initialDelay = 20_000, fixedDelay = 90_000)
  @Transactional
  public void backfillPending() {
    List<String> pending = events.findIpsWithoutLocation().stream()
        .filter(ip -> !isPrivate(ip))
        .limit(100)
        .toList();
    if (pending.isEmpty()) return;
    try {
      HttpResponse<String> res = http.send(
          HttpRequest.newBuilder(URI.create(IPAPI_BATCH))
              .timeout(Duration.ofSeconds(10))
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(pending)))
              .build(),
          HttpResponse.BodyHandlers.ofString());
      if (res.statusCode() != 200) { log.warn("ip-api batch HTTP {}", res.statusCode()); return; }
      for (JsonNode node : json.readTree(res.body())) {
        String ip = node.path("query").asText(null);
        if (ip == null) continue;
        IpLocation loc = locations.get(ip);
        if (loc == null) loc = new IpLocation(ip);
        if ("success".equals(node.path("status").asText())) {
          loc.set(
              blankToNull(node.path("countryCode").asText(null)),
              blankToNull(node.path("country").asText(null)),
              blankToNull(node.path("regionName").asText(null)),
              blankToNull(node.path("city").asText(null)),
              node.path("lat").asDouble(), node.path("lon").asDouble(),
              blankToNull(node.path("isp").asText(null)),
              blankToNull(node.path("org").asText(null)),
              "ipapi");
        } else {
          loc.set(null, null, null, null, 0, 0, null, null, "none");
        }
        locations.save(loc);
      }
      log.info("ip-api backfilled {} IP(s)", pending.size());
    } catch (Exception e) {
      log.warn("ip-api backfill failed: {}", e.toString());
    }
  }

  static boolean isPrivate(String ip) {
    try {
      InetAddress addr = InetAddress.getByName(ip);
      return addr.isLoopbackAddress() || addr.isSiteLocalAddress() || addr.isLinkLocalAddress()
          || addr.isAnyLocalAddress();
    } catch (Exception e) {
      return false;
    }
  }

  private static Double parseDouble(String v) {
    if (v == null || v.isBlank()) return null;
    try { return Double.parseDouble(v.trim()); } catch (NumberFormatException e) { return null; }
  }

  private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v; }
}
