-- Run this in Supabase SQL Editor AFTER running the 20260305000002_brands.sql migration
-- Replace 'YOUR_USER_ID' with Ernest's actual auth.uid() from the profiles table

-- First, find Ernest's user ID:
-- SELECT id FROM profiles LIMIT 1;

-- Then replace below:
-- SET my_user_id = '...';

DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM profiles LIMIT 1;

  INSERT INTO brands (user_id, name, slug, color, drive_folder) VALUES
    (uid, 'Blais Lab',         'blais-lab',         '#D72638', 'BLAIS_LAB_SOCIAL'),
    (uid, 'The MJ Vault',      'the-mj-vault',      '#3498DB', NULL),
    (uid, 'Analog Imprints',   'analog-imprints',   '#2ECC71', NULL),
    (uid, 'Blais AI Films',    'blais-ai-films',    '#9B59B6', NULL),
    (uid, 'Tha Bone Cult',     'tha-bone-cult',     '#F39C12', NULL),
    (uid, 'Retro Fur Babies',  'retro-fur-babies',  '#1ABC9C', NULL),
    (uid, 'Bella Rose',        'bella-rose',        '#E67E22', NULL),
    (uid, 'The Eras',          'the-eras',          '#E74C3C', NULL),
    (uid, 'Heal Frontier',     'heal-frontier',     '#8E44AD', NULL),
    (uid, 'Seranova Sculpt',   'seranova-sculpt',   '#2C3E50', NULL)
  ON CONFLICT (user_id, slug) DO NOTHING;
END $$;

-- After inserting brands, assign social_accounts to brands
-- Run these UPDATEs manually based on your actual display_name/username mappings:
--
-- UPDATE social_accounts SET brand_id = (SELECT id FROM brands WHERE slug = 'blais-lab')
--   WHERE display_name ILIKE '%blais lab%' OR username ILIKE '%blaislab%';
--
-- UPDATE social_accounts SET brand_id = (SELECT id FROM brands WHERE slug = 'the-mj-vault')
--   WHERE display_name ILIKE '%mj vault%' OR username ILIKE '%mjvault%';
--
-- ... repeat for each brand
