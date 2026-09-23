package com.orchestration.weather;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 랜딩 페이지 날씨 위젯용 공개 엔드포인트. 서버가 캐싱해둔 Open-Meteo 원본 JSON을 그대로 내려준다. */
@RestController
class WeatherController {

  private final WeatherService weatherService;

  WeatherController(WeatherService weatherService) {
    this.weatherService = weatherService;
  }

  @GetMapping(path = "/api/public/weather", produces = MediaType.APPLICATION_JSON_VALUE)
  ResponseEntity<String> weather() {
    String cached = weatherService.cachedJson();
    if (cached == null) {
      // 첫 warm-up이 아직 안 끝났거나 실패한 극초반 -- 프런트는 이 상태를 "조회 실패"로 처리해 조용히 숨긴다
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    return ResponseEntity.ok(cached);
  }
}
