package com.orchestration.diag;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.orchestration.files.FileProperties;
import java.io.ByteArrayInputStream;
import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EvidenceServiceTest {
  @TempDir Path temp;
  @Test void storesBytesOnceAndReportsDuplicateFromMetadata() throws Exception {
    EvidenceRepository repository = mock(EvidenceRepository.class);
    when(repository.existsBySha256(anyString())).thenReturn(false, true);
    EvidenceService service = new EvidenceService(repository, new FileProperties(temp.toString(), "", 1), "");
    byte[] body = "same evidence".getBytes(); UUID user = UUID.randomUUID();
    assertFalse(service.save(new ByteArrayInputStream(body), "js-parser", "capture.json", body.length, "application/json", user));
    assertTrue(service.save(new ByteArrayInputStream(body), "js-parser", "capture.json", body.length, "application/json", user));
    try (var paths = Files.walk(temp)) { assertEquals(1, paths.filter(Files::isRegularFile).count()); }
    verify(repository, times(2)).save(any(EvidenceRecord.class));
  }
  @Test void burpHistoryIsRestrictedToConfiguredOwner() throws Exception {
    EvidenceRepository repository = mock(EvidenceRepository.class);
    UUID owner = UUID.randomUUID(); EvidenceService service = new EvidenceService(repository, new FileProperties(temp.toString(), "", 1), owner.toString());
    assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.save(new ByteArrayInputStream(new byte[]{1}), "burp-history", "x", 1, "x", UUID.randomUUID()));
    verifyNoInteractions(repository);
  }
}
