package com.orchestration.files;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;

import com.orchestration.n8n.N8nDispatcher;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.attribute.FileTime;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;

@ExtendWith(MockitoExtension.class)
class FileIntakeServiceTest {

  @Mock private FileIntakeRepository jobs;
  @Mock private N8nDispatcher n8nDispatcher;
  @Mock private DocumentExtractionService extraction;

  @TempDir private Path originals;

  private FileIntakeService service() {
    FileProperties properties = new FileProperties(originals.toString(), originals.resolve("obsidian").toString(), 30000);
    return new FileIntakeService(properties, jobs, n8nDispatcher, extraction);
  }

  @BeforeEach
  void stubDefaults() {
    when(jobs.existsBySourcePath(anyString())).thenReturn(false);
    when(jobs.save(org.mockito.ArgumentMatchers.any())).thenAnswer(invocation -> invocation.getArgument(0));
    when(n8nDispatcher.dispatchFileIntake(any())).thenReturn(CompletableFuture.completedFuture(null));
  }

  @Test
  void firstScan_checksEveryFileAgainstTheDb() throws IOException {
    Files.writeString(originals.resolve("a.txt"), "a");
    Files.writeString(originals.resolve("b.txt"), "b");

    service().discoverNewOriginals();

    verify(jobs, times(2)).existsBySourcePath(anyString());
  }

  @Test
  void secondScan_skipsFilesUntouchedSinceTheLastScan() throws IOException {
    Path file = originals.resolve("old.txt");
    Files.writeString(file, "old");
    // 스캔 커트라인에는 초 단위 반올림 여유(2초)가 있으니, "안 건드림"을 확실히 표현하려면
    // 파일 mtime을 그 여유보다 더 과거로 못박아 둔다.
    Files.setLastModifiedTime(file, FileTime.from(Instant.now().minusSeconds(10)));
    FileIntakeService service = service();
    service.discoverNewOriginals();
    verify(jobs, times(1)).existsBySourcePath(anyString());

    // 두 번째 스캔에서는 새 파일이 없으니 DB에 다시 묻지 않아야 한다.
    service.discoverNewOriginals();

    verify(jobs, times(1)).existsBySourcePath(anyString());
  }

  @Test
  void secondScan_stillChecksAFileModifiedAfterTheLastScan() throws IOException {
    Path file = originals.resolve("changed.txt");
    Files.writeString(file, "v1");
    FileIntakeService service = service();
    service.discoverNewOriginals();
    verify(jobs, times(1)).existsBySourcePath(anyString());

    Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(5)));
    service.discoverNewOriginals();

    verify(jobs, times(2)).existsBySourcePath(anyString());
  }

  @Test
  void secondScan_checksABrandNewFileAddedAfterTheFirstScan() throws IOException {
    Path oldFile = originals.resolve("first.txt");
    Files.writeString(oldFile, "1");
    Files.setLastModifiedTime(oldFile, FileTime.from(Instant.now().minusSeconds(10)));
    FileIntakeService service = service();
    service.discoverNewOriginals();
    verify(jobs, times(1)).existsBySourcePath(anyString());

    Files.writeString(originals.resolve("second.txt"), "2");
    service.discoverNewOriginals();

    verify(jobs, times(2)).existsBySourcePath(anyString());
  }

  @Test
  void skippedFile_isNeverEnqueued() throws IOException {
    Path file = originals.resolve("static.txt");
    Files.writeString(file, "x");
    Files.setLastModifiedTime(file, FileTime.from(Instant.now().minusSeconds(10)));
    FileIntakeService service = service();
    service.discoverNewOriginals();
    service.discoverNewOriginals();

    verify(jobs, times(2)).save(org.mockito.ArgumentMatchers.any()); // creation plus ignored-dispatch status
  }

  @Test
  void upload_returnsItsOwnJobAndMarksSuccessfulDispatch() throws IOException {
    when(n8nDispatcher.dispatchFileIntake(any())).thenReturn(CompletableFuture.completedFuture(204));
    when(extraction.analyze(any(), anyString(), anyString(), anyString())).thenReturn(Optional.empty());
    FileIntakeService.EnqueueResult result = service().saveUpload("report.txt", new byte[] {1}).orElseThrow();
    assertThat(result.job().getFileName()).isEqualTo("report.txt");
    assertThat(result.job().getStatus()).isEqualTo(IntakeStatus.COMPLETED);
  }

  @Test
  void dispatchFailure_retriesThenMarksJobFailed() throws IOException {
    when(n8nDispatcher.dispatchFileIntake(any())).thenReturn(CompletableFuture.completedFuture(503));
    when(extraction.analyze(any(), anyString(), anyString(), anyString())).thenReturn(Optional.empty());
    FileProperties properties = new FileProperties(originals.toString(), originals.resolve("obsidian").toString(), 30000);
    FileIntakeService target = new FileIntakeService(properties, jobs, n8nDispatcher, extraction, new long[] {0, 0});
    FileIntakeJob job = target.saveUpload("report.txt", new byte[] {1}).orElseThrow().job();
    org.awaitility.Awaitility.await().untilAsserted(() -> assertThat(job.getStatus()).isEqualTo(IntakeStatus.FAILED));
    verify(n8nDispatcher, times(3)).dispatchFileIntake(job);
  }
}
