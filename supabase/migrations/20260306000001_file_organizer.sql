-- File Organizer: logs file sorting/moves for content organization
CREATE TABLE file_sort_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  source_path text,
  dest_path text NOT NULL,
  brand_slug text,
  track text,
  batch text,
  day_num integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_file_sort_log_user ON file_sort_log(user_id);
CREATE INDEX idx_file_sort_log_brand ON file_sort_log(brand_slug);

ALTER TABLE file_sort_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own file sort logs"
  ON file_sort_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
