package com.orchestration.weather;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 랜딩 페이지 날씨 — 서울 고정, 방문자마다 다를 게 없으니 서버가 대신 한 번 받아서 캐싱해둔다.
 * 클라이언트가 직접 Open-Meteo를 부르면 방문자 수만큼 외부 호출이 나가고 그만큼 느려지므로,
 * 서버가 10분마다 한 번만 갱신하고 모든 요청에는 캐시된 원본 JSON을 그대로 내려준다.
 */
@Service
public class WeatherService {

  private static final Logger log = LoggerFactory.getLogger(WeatherService.class);
  private static final String UPSTREAM_URL =
      "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780"
          + "&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code"
          + "&daily=weather_code,temperature_2m_max,temperature_2m_min"
          + "&timezone=Asia%2FSeoul&forecast_days=5";

  private final HttpClient httpClient = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(5))
      .build();

  private volatile String cachedJson;

  @PostConstruct
  void warmUp() {
    refresh();
  }

  @Scheduled(fixedDelay = 600_000)
  void refresh() {
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(UPSTREAM_URL))
          .timeout(Duration.ofSeconds(5))
          .GET()
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() == 200) {
        cachedJson = response.body();
      } else {
        log.warn("weather_upstream_non_200 status={}", response.statusCode());
      }
    } catch (Exception exception) {
      // 캐시가 이미 있으면 이전 값 유지 -- 업스트림 일시 장애로 위젯이 아예 비는 것보다 낫다
      log.warn("weather_refresh_failed", exception);
    }
  }

  /** 캐시가 아직 없으면(첫 요청이 warmUp 실패 직후 들어온 경우) null. */
  public String cachedJson() {
    return cachedJson;
  }
}
