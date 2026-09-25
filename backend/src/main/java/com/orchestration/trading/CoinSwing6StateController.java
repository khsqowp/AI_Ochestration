package com.orchestration.trading;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** trading-coin-swing6 컨테이너가 공유 볼륨에 쓰는 상태 파일을 읽어 그대로 내려준다. */
@RestController
@RequestMapping("/api/trading/coin-swing6")
public class CoinSwing6StateController {
  private final Path statePath;
  private final ObjectMapper objectMapper;

  CoinSwing6StateController(
      @Value("${app.trading.coin-swing6-state-path:/workspace/trading-state-coin-swing6/coin_swing6_state.json}")
          String statePath,
      ObjectMapper objectMapper) {
    this.statePath = Path.of(statePath);
    this.objectMapper = objectMapper;
  }

  @GetMapping("/state")
  public CoinSwing6State state() throws IOException {
    if (!Files.exists(statePath)) {
      return CoinSwing6State.empty();
    }
    return objectMapper.readValue(Files.readString(statePath), CoinSwing6State.class);
  }
}
