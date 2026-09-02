package com.orchestration.trading;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * trading-kr-rotation / trading-us-rotation 컨테이너가 공유 볼륨에 쓰는 상태 파일을 읽어
 * 그대로 내려준다. KIS 모의 top-N 모멘텀 로테이션 페이퍼봇.
 */
@RestController
@RequestMapping("/api/trading/rotation")
public class StockRotationStateController {
  private final Path krPath;
  private final Path usPath;
  private final ObjectMapper objectMapper;

  StockRotationStateController(
      @Value("${app.trading.kr-rotation-state-path:/workspace/trading-state-kr-rotation/stock_rotation_state.json}")
          String krPath,
      @Value("${app.trading.us-rotation-state-path:/workspace/trading-state-us-rotation/stock_rotation_state.json}")
          String usPath,
      ObjectMapper objectMapper) {
    this.krPath = Path.of(krPath);
    this.usPath = Path.of(usPath);
    this.objectMapper = objectMapper;
  }

  @GetMapping("/kr/state")
  public StockRotationState kr() throws IOException {
    return read(krPath);
  }

  @GetMapping("/us/state")
  public StockRotationState us() throws IOException {
    return read(usPath);
  }

  private StockRotationState read(Path path) throws IOException {
    if (!Files.exists(path)) {
      return StockRotationState.empty();
    }
    return objectMapper.readValue(Files.readString(path), StockRotationState.class);
  }
}
