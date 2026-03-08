-- YouTube Audits
CREATE TABLE IF NOT EXISTS youtube_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  audit_data jsonb NOT NULL DEFAULT '{}',
  score int,
  recommendations jsonb DEFAULT '[]',
  best_post_times jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE youtube_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own audits" ON youtube_audits FOR ALL USING (user_id = auth.uid());

-- Competitor Videos
CREATE TABLE IF NOT EXISTS competitor_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES competitors(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text,
  published_at timestamptz,
  views int DEFAULT 0,
  likes int DEFAULT 0,
  comments int DEFAULT 0,
  duration text,
  tags text[],
  thumbnail_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(competitor_id, video_id)
);

ALTER TABLE competitor_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own competitor videos" ON competitor_videos FOR ALL
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

-- YouTube Keywords
CREATE TABLE IF NOT EXISTS youtube_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  keyword text NOT NULL,
  parent_keyword text,
  search_volume_tier text,
  competition_tier text,
  niche text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE youtube_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own keywords" ON youtube_keywords FOR ALL USING (user_id = auth.uid());
