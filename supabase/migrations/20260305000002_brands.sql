-- Brands table: groups social accounts under a named brand per user
CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color text DEFAULT '#3498DB',
  avatar_url text,
  drive_folder text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, slug)
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own brands" ON brands FOR ALL USING (auth.uid() = user_id);

-- Add brand_id FK to social_accounts
ALTER TABLE social_accounts ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
