package com.orchestration.trading;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TradingControlWriterTest {
  @TempDir Path tempDir;

  @Test
  void corruptedControlFileIsQuarantinedWithoutIssuingCommand() throws IOException {
    Path controlPath = tempDir.resolve("control.json");
    String corruptedContent = "{invalid json";
    Files.writeString(controlPath, corruptedContent);
    TradingControlWriter writer = new TradingControlWriter(controlPath.toString(), new ObjectMapper());

    assertThrows(IOException.class, () -> writer.issue("momentum-rotation", "flatten", null));

    assertFalse(Files.exists(controlPath));
    try (Stream<Path> files = Files.list(tempDir)) {
      Path quarantinePath = files
          .filter(path -> path.getFileName().toString().startsWith("control.json.corrupt-"))
          .findFirst()
          .orElseThrow();
      assertEquals(corruptedContent, Files.readString(quarantinePath));
    }
  }

  @Test
  void issuingAnotherBotPreservesExistingSlot() throws IOException {
    Path controlPath = tempDir.resolve("control.json");
    ObjectMapper mapper = new ObjectMapper();
    Map<String, Object> existingSlot = Map.of("cmd", "enter", "nonce", "existing-nonce");
    Files.writeString(controlPath, mapper.writeValueAsString(Map.of("kr-rotation", existingSlot)));
    TradingControlWriter writer = new TradingControlWriter(controlPath.toString(), mapper);

    writer.issue("momentum-rotation", "flatten", null);

    @SuppressWarnings("unchecked")
    Map<String, Object> result = mapper.readValue(Files.readString(controlPath), Map.class);
    assertEquals(existingSlot, result.get("kr-rotation"));
    assertTrue(result.containsKey("momentum-rotation"));
  }
}
