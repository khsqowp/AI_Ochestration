ALTER TABLE access_event ADD COLUMN user_email VARCHAR(320) NULL;
ALTER TABLE access_event ADD COLUMN user_display_name VARCHAR(120) NULL;
CREATE INDEX idx_access_event_user_email ON access_event (user_email);
