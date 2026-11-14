package com.orchestration.diag;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;

class EvidenceContractTest {
  @Test void entityAndMigrationContainMetadataOnly() throws Exception {
    assertEquals(8, EvidenceRecord.class.getDeclaredFields().length);
    String sql = Files.readString(Path.of("src/main/resources/db/migration/V12__create_diag_evidence.sql")).toLowerCase();
    assertFalse(sql.contains("blob")); assertFalse(sql.contains("longtext")); assertFalse(sql.contains("content "));
  }
  @Test void controllerHasNoReadRoutes() {
    for (Method method : EvidenceController.class.getDeclaredMethods()) assertNull(method.getAnnotation(GetMapping.class));
  }
}
