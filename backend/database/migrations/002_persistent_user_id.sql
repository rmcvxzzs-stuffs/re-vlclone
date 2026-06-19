ALTER TABLE watch_history ADD COLUMN user_id TEXT;
ALTER TABLE access_log ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, media_id);