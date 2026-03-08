CREATE TABLE IF NOT EXISTS canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  label text NOT NULL,
  text text NOT NULL,
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE canned_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own responses" ON canned_responses FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_canned_responses_user ON canned_responses(user_id);
