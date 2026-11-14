package com.orchestration.diag;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "diag_evidence")
class EvidenceRecord {
  @Id @Column(columnDefinition = "BINARY(16)") private UUID id;
  @Column(nullable = false, length = 64) private String sha256;
  @Column(name = "tool_type", nullable = false, length = 40) private String toolType;
  @Column(name = "original_filename", nullable = false, length = 255) private String originalFilename;
  @Column(name = "size_bytes", nullable = false) private long sizeBytes;
  @Column(name = "content_type", nullable = false, length = 255) private String contentType;
  @Column(name = "uploaded_by_user_id", nullable = false, columnDefinition = "BINARY(16)") private UUID uploadedByUserId;
  @Column(name = "uploaded_at", nullable = false) private Instant uploadedAt;
  protected EvidenceRecord() {}
  EvidenceRecord(String sha256, String toolType, String originalFilename, long sizeBytes, String contentType, UUID uploadedByUserId) {
    this.id = UUID.randomUUID(); this.sha256 = sha256; this.toolType = toolType; this.originalFilename = originalFilename;
    this.sizeBytes = sizeBytes; this.contentType = contentType; this.uploadedByUserId = uploadedByUserId; this.uploadedAt = Instant.now();
  }
}
