package com.orchestration.access;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccessLogService {
  private static final Logger log = LoggerFactory.getLogger(AccessLogService.class);
  private static final int RETENTION_DAYS = 45;

  private final AccessEventRepository events;
  private final IpLocationRepository locations;
  private final GeoLocator geo;

  AccessLogService(AccessEventRepository events, IpLocationRepository locations, GeoLocator geo) {
    this.events = events;
    this.locations = locations;
    this.geo = geo;
  }

  /** Not {@code @Transactional}: the event insert and the geo upsert are independent units so a
   * concurrent-insert race on {@code ip_location} can't roll back a perfectly good event row. */
  public void record(Hit hit) {
    try {
      events.save(new AccessEvent(hit.ip(), hit.method(), hit.path(), hit.status(),
          hit.userAgent(), hit.hadSession(), hit.source(), hit.userEmail(), hit.userDisplayName()));
    } catch (Exception e) {
      log.debug("access event write skipped: {}", e.toString());
    }
    try {
      geo.note(hit.ip(), hit.cfLat(), hit.cfLon(), hit.cfCity(), hit.cfRegion(), hit.cfCountry());
    } catch (Exception e) {
      log.debug("geo note skipped: {}", e.toString());
    }
  }

  public record Hit(String ip, String method, String path, int status, String userAgent, boolean hadSession,
                    String source, String userEmail, String userDisplayName,
                    String cfLat, String cfLon, String cfCity, String cfRegion, String cfCountry) {}

  @Transactional(readOnly = true)
  public Summary summary() {
    Map<String, IpLocation> locByIp = locations.findAll().stream()
        .collect(Collectors.toMap(IpLocation::getIp, Function.identity(), (a, b) -> a));

    List<Point> points = new ArrayList<>();
    long uniqueIps = 0;
    var countries = new java.util.HashSet<String>();
    for (AccessEventRepository.IpAggregate agg : events.aggregateByIp()) {
      uniqueIps++;
      IpLocation loc = locByIp.get(agg.getIp());
      if (loc != null && loc.getCountry() != null && !"로컬".equals(loc.getCountry())) countries.add(loc.getCountry());
      boolean mappable = loc != null && (loc.getLat() != 0 || loc.getLon() != 0)
          && ("cf".equals(loc.getAccuracy()) || "ipapi".equals(loc.getAccuracy()));
      if (!mappable) continue;
      points.add(new Point(agg.getIp(), loc.getLat(), loc.getLon(), loc.getAccuracy(),
          loc.getCity(), loc.getRegion(), loc.getCountry(), loc.getCountryCode(), loc.getIsp(), loc.getOrg(),
          agg.getHits(), agg.getSessionHits(), agg.getLastSeen()));
    }

    List<Recent> recent = events.findAllByOrderByTsDesc(PageRequest.of(0, 120)).stream()
        .map(e -> toRecent(e, locByIp)).toList();

    List<UserSummary> users = events.aggregateByUser().stream()
        .map(agg -> new UserSummary(agg.getEmail(), agg.getDisplayName(), agg.getHits(), agg.getLastSeen()))
        .sorted(Comparator.comparing(UserSummary::lastSeen).reversed())
        .toList();

    long total = events.count();
    long last24h = events.countByTsAfter(Instant.now().minus(24, ChronoUnit.HOURS));

    return new Summary(points, recent, users,
        new Stats(total, uniqueIps, countries.size(), points.size(), last24h));
  }

  /** 관리 › 접근기록에서 특정 계정을 골랐을 때 그 계정의 활동만 최신순으로. */
  @Transactional(readOnly = true)
  public List<Recent> activityByUser(String email) {
    Map<String, IpLocation> locByIp = locations.findAll().stream()
        .collect(Collectors.toMap(IpLocation::getIp, Function.identity(), (a, b) -> a));
    return events.findByUserEmailOrderByTsDesc(email, PageRequest.of(0, 300)).stream()
        .map(e -> toRecent(e, locByIp)).toList();
  }

  private Recent toRecent(AccessEvent e, Map<String, IpLocation> locByIp) {
    IpLocation loc = locByIp.get(e.getIp());
    return new Recent(e.getTs(), e.getIp(), e.getMethod(), e.getPath(), e.getStatus(), e.isHadSession(),
        e.getSource(), e.getUserEmail(), e.getUserDisplayName(),
        loc == null ? null : loc.getCity(), loc == null ? null : loc.getCountry(),
        loc == null ? null : loc.getCountryCode(), loc == null ? null : loc.getIsp());
  }

  @Scheduled(cron = "0 30 4 * * *")
  @Transactional
  public void purgeOld() {
    long removed = events.deleteByTsBefore(Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS));
    if (removed > 0) log.info("access log purge: {} rows", removed);
  }

  public record Point(String ip, double lat, double lon, String accuracy, String city, String region,
                      String country, String countryCode, String isp, String org,
                      long hits, long sessionHits, Instant lastSeen) {}

  public record Recent(Instant ts, String ip, String method, String path, int status, boolean hadSession,
                       String source, String userEmail, String userDisplayName,
                       String city, String country, String countryCode, String isp) {}

  public record Stats(long totalHits, long uniqueIps, long countries, long mappedIps, long last24h) {}

  /** 로그인 계정별 집계 -- 접근기록 화면의 "계정별로 보기" 드롭다운을 채운다. */
  public record UserSummary(String email, String displayName, long hits, Instant lastSeen) {}

  public record Summary(List<Point> points, List<Recent> recent, List<UserSummary> users, Stats stats) {}
}
