-- 블랙박스 사건을 여러 번 반복해도 세션 하나짜리 피드백만 보였다. 최근 N개 세션의 feedback_md를
-- 모아 AI가 "반복되는 공통 약점"을 별도로 요약해 저장하는 칼럼 — refreshBlackBoxAssessment()가
-- 세션이 새로 닫힐 때만 갱신하므로(캐시), 대시보드를 열 때마다 재호출하지 않는다.
ALTER TABLE competency_assessment ADD COLUMN pattern_summary TEXT NULL;
