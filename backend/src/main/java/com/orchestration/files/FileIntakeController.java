package com.orchestration.files;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/files")
public class FileIntakeController {
  private final FileIntakeService service;
  FileIntakeController(FileIntakeService service) { this.service = service; }
  @GetMapping("/intake-jobs")
  public List<FileIntakeResponse> recent() {
    return service.recent().stream().map(FileIntakeResponse::from).toList();
  }
  @PostMapping("/upload")
  public FileIntakeResponse upload(@RequestParam("file") MultipartFile file) throws java.io.IOException {
    if (file.isEmpty() || file.getSize() > 50L * 1024 * 1024) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "50MB 이하 파일만 업로드할 수 있습니다.");
    java.util.Optional<java.util.UUID> analysisTaskId = service.saveUpload(file.getOriginalFilename(), file.getBytes());
    return service.recent().stream().findFirst().map(job -> FileIntakeResponse.from(job, analysisTaskId.map(Object::toString).orElse(null))).orElseThrow();
  }
  record FileIntakeResponse(String id, String sourcePath, String fileName, String extension, IntakeStatus status, String discoveredAt, String note, String analysisTaskId) {
    static FileIntakeResponse from(FileIntakeJob job) { return from(job, null); }
    static FileIntakeResponse from(FileIntakeJob job, String analysisTaskId) {
      return new FileIntakeResponse(job.getId().toString(), job.getSourcePath(), job.getFileName(), job.getExtension(), job.getStatus(), job.getDiscoveredAt().toString(), job.getNote(), analysisTaskId);
    }
  }
}
