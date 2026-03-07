-- Autolists: evergreen re-posting rules
CREATE TABLE IF NOT EXISTS autolists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  account_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  schedule_cron TEXT NOT NULL DEFAULT '0 12 * * *',
  repeat_interval_days INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_posted_at TIMESTAMPTZ,
  next_post_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Autolist items: posts in the rotation
CREATE TABLE IF NOT EXISTS autolist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autolist_id UUID NOT NULL REFERENCES autolists(id) ON DELETE CASCADE,
  caption TEXT NOT NULL,
  media_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sort_order INT NOT NULL DEFAULT 0,
  times_posted INT NOT NULL DEFAULT 0,
  last_posted_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SmartLinks: link-in-bio pages
CREATE TABLE IF NOT EXISTS smartlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  theme JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_views INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SmartLink items: buttons/links on the page
CREATE TABLE IF NOT EXISTS smartlink_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlink_id UUID NOT NULL REFERENCES smartlinks(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'link',
  title TEXT NOT NULL,
  url TEXT,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  clicks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SmartLink clicks: analytics
CREATE TABLE IF NOT EXISTS smartlink_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlink_id UUID NOT NULL REFERENCES smartlinks(id) ON DELETE CASCADE,
  item_id UUID REFERENCES smartlink_items(id) ON DELETE CASCADE,
  referrer TEXT,
  user_agent TEXT,
  country TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Competitors: profiles to track
CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  platform_user_id TEXT,
  display_name TEXT,
  avatar_url TEXT,
  followers INT,
  following INT,
  post_count INT,
  engagement_rate NUMERIC(5,2),
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Competitor snapshots: historical data
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  followers INT,
  following INT,
  post_count INT,
  engagement_rate NUMERIC(5,2),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content curation: RSS feeds
CREATE TABLE IF NOT EXISTS content_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  last_fetched_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Curated content items
CREATE TABLE IF NOT EXISTS curated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID REFERENCES content_feeds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT,
  summary TEXT,
  image_url TEXT,
  source TEXT,
  is_saved BOOLEAN NOT NULL DEFAULT false,
  is_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE autolists ENABLE ROW LEVEL SECURITY;
ALTER TABLE autolist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlink_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlink_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE curated_content ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY autolists_user ON autolists FOR ALL USING (user_id = auth.uid());
CREATE POLICY autolist_items_user ON autolist_items FOR ALL USING (autolist_id IN (SELECT id FROM autolists WHERE user_id = auth.uid()));
CREATE POLICY smartlinks_user ON smartlinks FOR ALL USING (user_id = auth.uid());
CREATE POLICY smartlink_items_user ON smartlink_items FOR ALL USING (smartlink_id IN (SELECT id FROM smartlinks WHERE user_id = auth.uid()));
CREATE POLICY smartlink_clicks_read ON smartlink_clicks FOR SELECT USING (smartlink_id IN (SELECT id FROM smartlinks WHERE user_id = auth.uid()));
CREATE POLICY smartlink_clicks_insert ON smartlink_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY competitors_user ON competitors FOR ALL USING (user_id = auth.uid());
CREATE POLICY competitor_snapshots_user ON competitor_snapshots FOR ALL USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));
CREATE POLICY content_feeds_user ON content_feeds FOR ALL USING (user_id = auth.uid());
CREATE POLICY curated_content_user ON curated_content FOR ALL USING (user_id = auth.uid());

-- Add first_comment column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS first_comment TEXT;
