CREATE TABLE dolphin_sessions (
  id BINARY(16) NOT NULL,
  owner_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  model VARCHAR(200) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_dolphin_sessions_owner_updated (owner_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE dolphin_messages (
  id BINARY(16) NOT NULL,
  session_id BINARY(16) NOT NULL,
  position INT NOT NULL,
  role VARCHAR(20) NOT NULL,
  content LONGTEXT NOT NULL,
  sources_json LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dolphin_messages_session_position (session_id, position),
  CONSTRAINT fk_dolphin_messages_session FOREIGN KEY (session_id) REFERENCES dolphin_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
