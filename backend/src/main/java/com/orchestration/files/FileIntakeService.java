package com.orchestration.files;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.orchestration.n8n.N8nDispatcher;

@Service
public class FileIntakeService {
  private static final Logger log = LoggerFactory.getLogger(FileIntakeService.class);
  private final FileProperties properties;
  private final FileIntakeRepository jobs;
  private final N8nDispatcher n8nDispatcher;
  private final DocumentExtractionService extraction;

  FileIntakeService(FileProperties properties, FileIntakeRepository jobs, N8nDispatcher n8nDispatcher, DocumentExtractionService extraction) {
    this.properties = properties; this.jobs = jobs; this.n8nDispatcher = n8nDispatcher; this.extraction = extraction;
  }

  @PostConstruct
  void ensureDirectories() throws IOException {
    Files.createDirectories(originalsRoot());
    Files.createDirectories(obsidianRoot());
  }

  // 매 스캔마다 트리 전체(web/ 크롤 캐시 포함 1만4천+ 파일)를 걸으면서 파일마다 existsBySourcePath
  // 쿼리를 날리면 실행마다 DB 왕복 수만 건이 튀어 mysql CPU가 수초간 90%대로 치솟는다(실측). 이미
  // 등록된 옛 파일은 mtime이 지난 스캔 이후로 바뀔 일이 없으므로, lastScanAt 이후 수정된 파일만 걸러
  // DB에 물어보면 정상 상태에서는 왕복이 거의 0건으로 준다. 인스턴스 필드라 재시작하면 한 번은 전체
  // 재검사하지만(허용 가능한 1회 비용), 그 뒤로는 새/변경 파일만 본다.
  private volatile Instant lastScanAt = Instant.EPOCH;

  // 파일시스템/마운트에 따라 mtime이 초 단위로 반올림될 수 있어, 다음 커트라인을 스캔 시작 시각보다
  // 살짝 앞당겨(여유 2초) 잡는다 -- 그 경계에 걸린 파일은 다음 스캔에서 한 번 더(저렴하게) 재확인될
  // 뿐이지만, 여유를 안 두면 반올림 때문에 영영 걸러지지 않는 파일이 생길 수 있다.
  private static final java.time.Duration SCAN_CLOCK_SKEW_MARGIN = java.time.Duration.ofSeconds(2);

  @Scheduled(fixedDelayString = "${app.files.scan-delay-ms:30000}")
  @Transactional
  public void discoverNewOriginals() {
    Path root = originalsRoot();
    Instant scanStartedAt = Instant.now();
    try (Stream<Path> paths = Files.walk(root)) {
      paths.filter(Files::isRegularFile).filter(path -> !path.getFileName().toString().equals(".gitkeep"))
          .filter(this::modifiedSinceLastScan)
          .forEach(this::enqueueIfNew);
      lastScanAt = scanStartedAt.minus(SCAN_CLOCK_SKEW_MARGIN);
    } catch (IOException exception) {
      log.warn("originals_scan_failed root={}", root, exception);
    }
  }

  private boolean modifiedSinceLastScan(Path path) {
    try {
      return Files.getLastModifiedTime(path).toInstant().isAfter(lastScanAt);
    } catch (IOException exception) {
      return true; // mtime 조회 실패하면 안전하게 검사 대상에 포함
    }
  }

  // 업로드 파일은 디스크 충돌 방지를 위해 저장명 앞에 UUID를 붙인다(saveUpload) -- sourcePath는 그대로 둬서
  // 실제 파일 위치는 유지하되, 작업 제목/보고서에 노출되는 fileName에서는 그 접두어를 잘라낸다.
  private static final Pattern UPLOAD_UUID_PREFIX =
      Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-");

  private Optional<UUID> enqueueIfNew(Path file) {
    String sourcePath = originalsRoot().relativize(file.toAbsolutePath().normalize()).toString();
    if (jobs.existsBySourcePath(sourcePath)) return Optional.empty();
    String fileName = UPLOAD_UUID_PREFIX.matcher(file.getFileName().toString()).replaceFirst("");
    String extension = extensionOf(fileName);
    FileIntakeJob job = jobs.save(new FileIntakeJob(sourcePath, fileName, extension));
    n8nDispatcher.dispatchFileIntake(job);
    log.info("file_intake_queued sourcePath={} extension={}", sourcePath, extension);
    // Files under web/ are the source-collector's own crawl cache and already get analyzed as part of
    // that collection run (SourceCollectionService); reprocessing them here would duplicate that work.
    if (sourcePath.startsWith("web/")) return Optional.empty();
    return extraction.analyze(file, sourcePath, fileName, extension);
  }

  @Transactional(readOnly = true)
  public List<FileIntakeJob> recent() { return jobs.findTop20ByOrderByDiscoveredAtDesc(); }

  public Optional<UUID> saveUpload(String originalFilename, byte[] content) throws IOException {
    String safeName = Path.of(originalFilename == null || originalFilename.isBlank() ? "upload" : originalFilename).getFileName().toString()
        .replaceAll("[^a-zA-Z0-9가-힣._ -]", "_");
    Path uploads = originalsRoot().resolve("uploads").resolve(java.time.LocalDate.now().toString());
    Files.createDirectories(uploads);
    Path target = uploads.resolve(java.util.UUID.randomUUID() + "-" + safeName).normalize();
    if (!target.startsWith(originalsRoot())) throw new IOException("invalid upload path");
    Files.write(target, content);
    return enqueueIfNew(target);
  }

  private Path originalsRoot() { return Path.of(properties.originalsPath()).toAbsolutePath().normalize(); }
  private Path obsidianRoot() { return Path.of(properties.obsidianPath()).toAbsolutePath().normalize(); }
  private String extensionOf(String name) { int index = name.lastIndexOf('.'); return index < 1 ? "unknown" : name.substring(index + 1).toLowerCase(Locale.ROOT); }
}
