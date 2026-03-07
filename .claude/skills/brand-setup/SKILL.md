---
name: brand-setup
description: Set up a new brand — create DB record, connect social accounts, organize Google Drive folders
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit
argument-hint: "[brand name]"
---

# Brand Setup

Set up a new brand in Blais Social Engine end-to-end.

## Steps

1. **Create brand record** in Supabase:
   ```sql
   INSERT INTO brands (user_id, name, slug, color)
   VALUES ('<user_id>', '$ARGUMENTS', '<slug>', '<color>')
   ```
   - Generate slug from name (lowercase, hyphens)
   - Pick a unique brand color (hex)
   - Get user_id from current auth context or ask

2. **Create Google Drive folder structure**:
   ```
   G:/My Drive/BLAIS SOCIAL ENGINE/<BRAND_NAME>_SOCIAL/
     TRACK_1/
       batch_01/
         captions/
         generated/
         edited/
         need revisions/
     assets/
       logos/
       templates/
   ```

3. **Create local working folder**:
   ```
   C:/Users/itsbl/Dropbox/0 Business 2024/0 - Social Media Automations/<Brand Name>/
   ```

4. **Guide social account connection**:
   - Direct user to `blais-social-engine.vercel.app/settings/accounts`
   - Walk through connecting Instagram, Facebook, Twitter, Bluesky as needed
   - After connection, update `social_accounts.brand_id` to link to the new brand

5. **Update brand record** with drive_folder path

6. **Create SETUP-PROMPT.md** in the brand's Dropbox folder with instructions for their Claude Code agent

## Existing Brands (10)
Blais Lab, The MJ Vault, Analog Imprints, Blais AI Films, Tha Bone Cult, Retro Fur Babies, Bella Rose, The Eras, Heal Frontier, Seranova Sculpt

## Database Connection
Use Supabase Management API:
```
POST https://api.supabase.com/v1/projects/mzwleneitsihjwfzfuho/database/query
```
