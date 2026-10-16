CREATE TABLE feedback_report (
  id BINARY(16) NOT NULL,
  author_id BINARY(16) NOT NULL,
  author_email VARCHAR(320) NOT NULL,
  author_display_name VARCHAR(120) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_feedback_report_author_created (author_id, created_at),
  KEY idx_feedback_report_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
