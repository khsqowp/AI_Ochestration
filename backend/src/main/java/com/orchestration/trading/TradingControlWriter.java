package com.orchestration.trading;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 로테이션 봇 수동 제어(즉시 매도/진입) 명령을 공유 볼륨의 control.json 에 쓴다.
 * 봇은 매 루프 틱마다 자기 슬롯을 읽고, 처리한 nonce 를 자기 상태파일에 기록해 재실행을 막는다.
 * 파일 한 개에 봇별 슬롯을 두므로, 쓸 때 기존 내용을 읽어 해당 슬롯만 교체한다.
 */
@Service
public class TradingControlWriter {
  private static final Logger log = LoggerFactory.getLogger(TradingControlWriter.class);

  /** control.json 에서 봇을 가리키는 키 = trading_control.py / 각 루프의 BOT_ID 와 일치해야 한다. */
  public static final Map<String, String> BOTS = Map.of(
      "momentum-rotation", "코인 모멘텀 로테이션 (실거래)",
      "kr-rotation", "국장 로테이션 (모의)",
      "us-rotation", "미장 로테이션 (모의)");

  private final Path controlPath;
  private final ObjectMapper objectMapper;

  TradingControlWriter(
      @Value("${app.trading.control-path:/workspace/trading-control/control.json}") String controlPath,
      ObjectMapper objectMapper) {
    this.controlPath = Path.of(controlPath);
    this.objectMapper = objectMapper;
  }

  /** cmd: "flatten" | "enter". 반환: 봇에 전달된 명령 슬롯. */
  public synchronized Map<String, Object> issue(String bot, String cmd, String reason) throws IOException {
    if (!BOTS.containsKey(bot)) {
      throw new IllegalArgumentException("알 수 없는 봇: " + bot);
    }
    if (!"flatten".equals(cmd) && !"enter".equals(cmd)) {
      throw new IllegalArgumentException("알 수 없는 명령: " + cmd);
    }

    Map<String, Object> root = readRoot();
    Map<String, Object> slot = new LinkedHashMap<>();
    slot.put("cmd", cmd);
    slot.put("nonce", UUID.randomUUID().toString());
    slot.put("ts", Instant.now().toString());
    if (reason != null && !reason.isBlank()) {
      slot.put("reason", reason);
    }
    root.put(bot, slot);

    Files.createDirectories(controlPath.getParent());
    Path tmp = controlPath.resolveSibling(controlPath.getFileName() + ".tmp");
    Files.writeString(tmp, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root));
    Files.move(tmp, controlPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    log.info("trading_control_issued bot={} cmd={}", bot, cmd);
    return slot;
  }

  /** 현재 접수돼 있는(아직 봇이 지웠는지 여부와 무관) 명령 슬롯. 없으면 null. */
  public Map<String, Object> pending(String bot) throws IOException {
    Object slot = readRoot().get(bot);
    return slot instanceof Map<?, ?> m ? cast(m) : null;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> readRoot() throws IOException {
    if (!Files.exists(controlPath)) {
      return new LinkedHashMap<>();
    }
    try {
      Object parsed = objectMapper.readValue(Files.readString(controlPath), Map.class);
      return parsed instanceof Map ? (Map<String, Object>) parsed : new LinkedHashMap<>();
    } catch (IOException exception) {
      log.warn("trading_control_read_failed, 새 파일로 덮어씀", exception);
      return new LinkedHashMap<>();
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> cast(Map<?, ?> m) {
    return (Map<String, Object>) m;
  }
}
