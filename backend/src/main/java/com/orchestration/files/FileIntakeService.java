package com.orchestration.files;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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

  @Scheduled(fixedDelayString = "${app.files.scan-delay-ms:30000}")
  @Transactional
  public void discoverNewOriginals() {
    Path root = originalsRoot();
    try (Stream<Path> paths = Files.walk(root)) {
      paths.filter(Files::isRegularFile).filter(path -> !path.getFileName().toString().equals(".gitkeep"))
          .forEach(this::enqueueIfNew);
    } catch (IOException exception) {
      log.warn("originals_scan_failed root={}", root, exception);
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
