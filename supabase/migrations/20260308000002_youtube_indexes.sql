-- Performance indexes for YouTube tables
CREATE INDEX IF NOT EXISTS idx_youtube_audits_account ON youtube_audits(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_audits_user ON youtube_audits(user_id);
CREATE INDEX IF NOT EXISTS idx_competitor_videos_competitor ON competitor_videos(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_videos_published ON competitor_videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_keywords_user ON youtube_keywords(user_id);
