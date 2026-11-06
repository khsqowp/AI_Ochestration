ALTER TABLE work_tasks
  ADD COLUMN batch_submission_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN last_batch_submission_attempt_at DATETIME(6) NULL;
