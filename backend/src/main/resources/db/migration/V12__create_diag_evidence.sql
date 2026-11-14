CREATE TABLE diag_evidence (
  id BINARY(16) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  tool_type VARCHAR(40) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  uploaded_by_user_id BINARY(16) NOT NULL,
  uploaded_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_diag_evidence_sha256 (sha256),
  KEY idx_diag_evidence_uploaded_by (uploaded_by_user_id, uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
