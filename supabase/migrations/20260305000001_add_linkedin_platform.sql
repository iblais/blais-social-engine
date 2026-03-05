-- Add LinkedIn to allowed platforms
ALTER TABLE social_accounts DROP CONSTRAINT IF EXISTS social_accounts_platform_check;
ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_platform_check
  CHECK (platform IN ('instagram','facebook','bluesky','pinterest','tiktok','youtube','twitter','linkedin'));
