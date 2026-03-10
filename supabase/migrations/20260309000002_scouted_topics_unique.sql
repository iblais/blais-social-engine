-- Add unique constraint for upsert and performance index
CREATE UNIQUE INDEX IF NOT EXISTS scouted_topics_run_title_uniq ON scouted_topics (run_id, title);
CREATE INDEX IF NOT EXISTS idx_scouted_topics_run_id ON scouted_topics (run_id);
CREATE INDEX IF NOT EXISTS idx_scouted_topics_channel_id ON scouted_topics (channel_id);
