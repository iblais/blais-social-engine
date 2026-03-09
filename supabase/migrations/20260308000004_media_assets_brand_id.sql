-- Add brand_id to media_assets for brand filtering
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_brand_id ON media_assets(brand_id);
