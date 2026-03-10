-- Add voice config columns to pipeline_channels
ALTER TABLE pipeline_channels
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS voice_settings jsonb DEFAULT '{}';

-- Add output columns to pipeline_runs for storing generated assets
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS voice_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;
