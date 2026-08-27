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
}

