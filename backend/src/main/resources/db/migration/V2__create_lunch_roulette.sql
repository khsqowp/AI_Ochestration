-- 점심 룰렛 -- 하루에 방 하나(day 유니크), 후보 이름은 순서 보존 컬렉션 테이블로 분리.
CREATE TABLE lunch_roulette (
  id BINARY(16) NOT NULL,
  day DATE NOT NULL,
  started_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_lunch_roulette_day UNIQUE (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lunch_roulette_candidate (
  roulette_id BINARY(16) NOT NULL,
  candidate_order INT NOT NULL,
  name VARCHAR(40) NOT NULL,
  PRIMARY KEY (roulette_id, candidate_order),
  CONSTRAINT fk_lunch_roulette_candidate_roulette FOREIGN KEY (roulette_id) REFERENCES lunch_roulette (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
