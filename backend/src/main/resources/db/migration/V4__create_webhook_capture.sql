-- 웹훅 캐처(webhook.site류) -- bin의 id 자체가 캡처 URL의 공개 토큰. 캡처 엔드포인트는 완전
-- 무인증이라 만료 후 정리(WebhookCleanupService)와 bin당 최대 200건 보관(WebhookService.trim)으로
-- 저장량을 제한한다.
CREATE TABLE webhook_bin (
  id BINARY(16) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE webhook_request (
  id BINARY(16) NOT NULL,
  bin_id BINARY(16) NOT NULL,
  received_at DATETIME(6) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  query_string VARCHAR(1024) NULL,
  remote_ip VARCHAR(64) NULL,
  content_type VARCHAR(256) NULL,
  content_length BIGINT NULL,
  headers_json TEXT NULL,
  body_text TEXT NULL,
  body_truncated BIT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_webhook_request_bin (bin_id, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
