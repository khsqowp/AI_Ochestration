ALTER TABLE feedback_report
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'OPEN';

CREATE TABLE feedback_comment (
  id BINARY(16) NOT NULL,
  report_id BINARY(16) NOT NULL,
  author_id BINARY(16) NOT NULL,
  author_email VARCHAR(320) NOT NULL,
  author_display_name VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_feedback_comment_report_created (report_id, created_at),
  CONSTRAINT fk_feedback_comment_report FOREIGN KEY (report_id) REFERENCES feedback_report (id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_comment_author FOREIGN KEY (author_id) REFERENCES app_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE feedback_notification (
  id BINARY(16) NOT NULL,
  recipient_id BINARY(16) NOT NULL,
  report_id BINARY(16) NOT NULL,
  comment_id BINARY(16) NOT NULL,
  report_title VARCHAR(160) NOT NULL,
  comment_preview VARCHAR(300) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  toast_shown_at DATETIME(6) NULL,
  read_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_feedback_notification_recipient_created (recipient_id, created_at),
  CONSTRAINT fk_feedback_notification_recipient FOREIGN KEY (recipient_id) REFERENCES app_users (id),
  CONSTRAINT fk_feedback_notification_report FOREIGN KEY (report_id) REFERENCES feedback_report (id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_notification_comment FOREIGN KEY (comment_id) REFERENCES feedback_comment (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
