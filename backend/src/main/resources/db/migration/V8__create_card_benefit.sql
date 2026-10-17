CREATE TABLE card_benefit (
  id BINARY(16) NOT NULL,
  name VARCHAR(160) NOT NULL,
  benefits TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_card_benefit_updated (updated_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
