CREATE TABLE notebook_entry (
  id BINARY(16) NOT NULL,
  owner_id BINARY(16) NOT NULL,
  owner_email VARCHAR(320) NOT NULL,
  owner_display_name VARCHAR(120) NOT NULL,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(40) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notebook_entry_owner_updated (owner_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notebook_image (
  id BINARY(16) NOT NULL,
  entry_id BINARY(16) NOT NULL,
  owner_id BINARY(16) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notebook_image_entry (entry_id),
  CONSTRAINT fk_notebook_image_entry FOREIGN KEY (entry_id) REFERENCES notebook_entry(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
