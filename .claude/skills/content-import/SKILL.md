---
name: content-import
description: Import content (captions + images) from Google Drive folders into the Blais Social Engine
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
argument-hint: "[brand name] [drive folder path]"
---

# Content Import from Google Drive

Import batches of captions and images from Google Drive into Blais Social Engine.

## Arguments
- `$0` = Brand name (e.g., "Blais Lab", "Heal Frontier", "Seranova")
- `$1` = Google Drive folder path (e.g., "G:/My Drive/BLAIS SOCIAL ENGINE/BLAIS_LAB_SOCIAL/TRACK_1/batch_01")

## Content Structure Expected

```
batch_XX/
  captions/
    *.txt          # Caption files (DAY N: format or one per file)
  edited/
    post_01/       # Numbered post folders
      01.jpg       # Slides in order
      02.jpg
      ...
    post_02/
      ...
```

## Workflow

1. **Discover content**: Scan the drive folder for caption files and image folders
2. **Parse captions**: Extract captions from text files (handle `DAY N:` format, plain text, etc.)
3. **Match to brand**: Look up the brand in the database, find its social accounts
4. **Preview import**: Show the user what will be imported (post count, platforms, schedule)
5. **Create posts**: For each post:
   - Upload images to Supabase Storage (`media` bucket)
   - Create `posts` record with caption, account_id, media_type
   - Create `post_media` records for each slide
   - Set status to 'draft' (user can schedule later)
6. **Report**: Show import summary

## Import Script Reference
See `scripts/import-content.ts` for the existing import implementation.
Requires: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IMPORT_ACCOUNT_ID`

## Important
- Always create as 'draft' status — never auto-schedule
- Preserve slide order (sort_order matches filename number)
- For carousel posts (multiple images), set media_type to 'carousel' for Instagram, 'image' for others
