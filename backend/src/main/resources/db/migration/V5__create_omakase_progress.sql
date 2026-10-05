-- 오마카세 -- 로그인 사용자별 커리큘럼(토픽)당 마지막으로 본 파일/스크롤 위치. 토픽을 다시 열 때
-- 이 값으로 바로 그 파일 + 위치로 복귀시킨다. 토픽당 행 하나(owner_id, topic_id 유일).
CREATE TABLE omakase_progress (
  id BINARY(16) NOT NULL,
  owner_id BINARY(16) NOT NULL,
  topic_id VARCHAR(80) NOT NULL,
  file_id VARCHAR(80) NOT NULL,
  scroll_fraction DOUBLE NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_omakase_progress_owner_topic (owner_id, topic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
