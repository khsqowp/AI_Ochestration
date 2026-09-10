package com.orchestration.trading;

import java.io.IOException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 로테이션 봇 수동 제어 — 즉시 매도(flatten) / 즉시 진입(enter).
 * {@code /api/trading/**} 는 SecurityConfig 에서 ADMIN 전용으로 고정돼 있다.
 * 명령은 공유 볼륨 control.json 에 적히고, 봇이 다음 폴링 틱(코인 5초 / 주식 10초)에 실행한다.
 */
@RestController
@RequestMapping("/api/trading/{bot}")
public class TradingControlController {
  private final TradingControlWriter control;

  TradingControlController(TradingControlWriter control) {
    this.control = control;
  }

  @PostMapping("/flatten")
  public Map<String, Object> flatten(@PathVariable String bot, @RequestBody(required = false) ControlRequest body) {
    return issue(bot, "flatten", body);
  }

  @PostMapping("/enter")
  public Map<String, Object> enter(@PathVariable String bot, @RequestBody(required = false) ControlRequest body) {
    return issue(bot, "enter", body);
  }

  private Map<String, Object> issue(String bot, String cmd, ControlRequest body) {
    if (!TradingControlWriter.BOTS.containsKey(bot)) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "알 수 없는 봇: " + bot);
    }
    try {
      Map<String, Object> slot = control.issue(bot, cmd, body == null ? null : body.reason());
      return Map.of("ok", true, "bot", bot, "command", slot);
    } catch (IOException exception) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "제어 파일 쓰기 실패: " + exception.getMessage());
    }
  }

  public record ControlRequest(String reason) {}
}
