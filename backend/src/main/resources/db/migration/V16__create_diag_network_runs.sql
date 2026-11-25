CREATE TABLE diag_network_runs (
  id BINARY(16) NOT NULL,
  requested_by_user_id BINARY(16) NOT NULL,
  target VARCHAR(255) NOT NULL,
  ports VARCHAR(64) NOT NULL,
  proxy VARCHAR(255) NULL,
  timeout_ms INT NOT NULL,
  steps_json LONGTEXT NOT NULL,
  verdict TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_diag_network_runs_user_created (requested_by_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
