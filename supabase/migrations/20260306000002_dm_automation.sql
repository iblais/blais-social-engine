-- DM/Comment Automation: rules, conversations, messages, tracking, stats

-- Rules table: keyword triggers and response templates
CREATE TABLE dm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'comment_keyword'
    CHECK (trigger_type IN ('comment_keyword', 'dm_keyword', 'story_mention', 'story_reply')),
  keywords text[] NOT NULL DEFAULT '{}',
  match_mode text NOT NULL DEFAULT 'contains'
    CHECK (match_mode IN ('exact', 'contains', 'starts_with', 'regex')),
  response_template text NOT NULL DEFAULT '',
  dm_template text,
  ai_enabled boolean DEFAULT false,
  ai_prompt text,
  cooldown_minutes integer DEFAULT 60,
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_dm_rules_account ON dm_rules(account_id);
CREATE INDEX idx_dm_rules_user ON dm_rules(user_id);

-- Conversations: tracks DM threads with users
CREATE TABLE dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE NOT NULL,
  ig_user_id text NOT NULL,
  ig_username text NOT NULL DEFAULT '',
  message_count integer DEFAULT 0,
  last_message_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, ig_user_id)
);

CREATE INDEX idx_dm_conversations_account ON dm_conversations(account_id);

-- Messages: individual messages in conversations
CREATE TABLE dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES dm_conversations(id) ON DELETE CASCADE NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text text NOT NULL,
  rule_id uuid REFERENCES dm_rules(id) ON DELETE SET NULL,
  is_automated boolean DEFAULT false,
  ig_message_id text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_dm_messages_conversation ON dm_messages(conversation_id);

-- Comment tracking: processed comments and replies
CREATE TABLE comment_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE NOT NULL,
  post_id text NOT NULL,
  ig_comment_id text NOT NULL UNIQUE,
  ig_user_id text NOT NULL,
  ig_username text NOT NULL DEFAULT '',
  comment_text text NOT NULL,
  reply_text text,
  rule_id uuid REFERENCES dm_rules(id) ON DELETE SET NULL,
  dm_sent boolean DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_comment_tracking_account ON comment_tracking(account_id);
CREATE INDEX idx_comment_tracking_comment ON comment_tracking(ig_comment_id);

-- Engagement stats: daily aggregates per account
CREATE TABLE engagement_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  comments_processed integer DEFAULT 0,
  replies_sent integer DEFAULT 0,
  dms_sent integer DEFAULT 0,
  ai_replies integer DEFAULT 0,
  rules_triggered integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(account_id, date)
);

CREATE INDEX idx_engagement_stats_account_date ON engagement_stats(account_id, date);

-- RLS policies
ALTER TABLE dm_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dm_rules"
  ON dm_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Conversations/messages: access via account ownership
CREATE POLICY "Users access own conversations"
  ON dm_conversations FOR ALL
  USING (account_id IN (SELECT id FROM social_accounts WHERE user_id = auth.uid()))
  WITH CHECK (account_id IN (SELECT id FROM social_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users access own messages"
  ON dm_messages FOR ALL
  USING (conversation_id IN (
    SELECT c.id FROM dm_conversations c
    JOIN social_accounts sa ON sa.id = c.account_id
    WHERE sa.user_id = auth.uid()
  ))
  WITH CHECK (conversation_id IN (
    SELECT c.id FROM dm_conversations c
    JOIN social_accounts sa ON sa.id = c.account_id
    WHERE sa.user_id = auth.uid()
  ));

CREATE POLICY "Users access own comment tracking"
  ON comment_tracking FOR ALL
  USING (account_id IN (SELECT id FROM social_accounts WHERE user_id = auth.uid()))
  WITH CHECK (account_id IN (SELECT id FROM social_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users access own engagement stats"
  ON engagement_stats FOR ALL
  USING (account_id IN (SELECT id FROM social_accounts WHERE user_id = auth.uid()))
  WITH CHECK (account_id IN (SELECT id FROM social_accounts WHERE user_id = auth.uid()));
