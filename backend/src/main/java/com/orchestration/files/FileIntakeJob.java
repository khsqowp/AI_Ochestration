package com.orchestration.files;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "file_intake_jobs")
public class FileIntakeJob {
  @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
  @Column(nullable = false, unique = true, length = 1024) private String sourcePath;
  @Column(nullable = false, length = 255) private String fileName;
  @Column(nullable = false, length = 40) private String extension;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private IntakeStatus status = IntakeStatus.PENDING;
  @Column(nullable = false) private Instant discoveredAt = Instant.now();
  @Column(length = 500) private String note;
  protected FileIntakeJob() {}
  public FileIntakeJob(String sourcePath, String fileName, String extension) { this.sourcePath = sourcePath; this.fileName = fileName; this.extension = extension; }
  public UUID getId() { return id; }
  public String getSourcePath() { return sourcePath; }
  public String getFileName() { return fileName; }
  public String getExtension() { return extension; }
  public IntakeStatus getStatus() { return status; }
  public Instant getDiscoveredAt() { return discoveredAt; }
  public String getNote() { return note; }
  void markDispatchSucceeded() { status = IntakeStatus.COMPLETED; note = null; }
  void markDispatchRetrying(int attempt) { status = IntakeStatus.PROCESSING; note = "n8n 전송 재시도 중 (" + attempt + "회차)"; }
  void markDispatchFailed(String reason) { status = IntakeStatus.FAILED; note = reason == null ? "n8n 전송 실패" : reason.substring(0, Math.min(reason.length(), 500)); }
  void markDispatchIgnored() { status = IntakeStatus.IGNORED; note = "n8n 전송 비활성화"; }
}
