-- 토픽 전체에 파일 1개(가장 최근 본 파일)만 기억하던 걸, 토픽 안의 파일별로 각자
-- 스크롤 위치를 기억하도록 확장. (owner_id, topic_id) 유일 제약을
-- (owner_id, topic_id, file_id) 유일 제약으로 바꾼다 -- 이제 같은 토픽 안 여러
-- 파일이 각자 행을 가질 수 있음.
ALTER TABLE omakase_progress DROP INDEX uq_omakase_progress_owner_topic;
ALTER TABLE omakase_progress ADD UNIQUE KEY uq_omakase_progress_owner_topic_file (owner_id, topic_id, file_id);
