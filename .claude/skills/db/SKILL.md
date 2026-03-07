---
name: db
description: Query the Supabase database directly — read data, check post status, inspect accounts, run analytics
allowed-tools: Bash, Read
argument-hint: "[SQL query or natural language question]"
---

# Supabase Database Query

Run SQL queries against the Blais Social Engine Supabase database.

## Connection

Use the Supabase Management API:
```
POST https://api.supabase.com/v1/projects/mzwleneitsihjwfzfuho/database/query
Authorization: Bearer $SUPABASE_ACCESS_TOKEN
Content-Type: application/json
Body: { "query": "YOUR SQL HERE" }
```

Get the token from environment: `$SUPABASE_ACCESS_TOKEN` or check `.env.local` for `SUPABASE_SERVICE_ROLE_KEY`.

## Usage

If `$ARGUMENTS` looks like SQL, run it directly.
If `$ARGUMENTS` is natural language, translate it to SQL first.

## Common Queries

- **Post status**: `SELECT status, count(*) FROM posts GROUP BY status`
- **Failed posts**: `SELECT p.id, p.caption, p.error_message, p.status, sa.platform, sa.username FROM posts p JOIN social_accounts sa ON p.account_id = sa.id WHERE p.status IN ('failed', 'retry') ORDER BY p.updated_at DESC LIMIT 20`
- **Brand accounts**: `SELECT b.name, sa.platform, sa.username FROM brands b JOIN social_accounts sa ON sa.brand_id = b.id ORDER BY b.name`
- **Scheduled posts**: `SELECT p.id, p.caption, p.scheduled_at, sa.platform FROM posts p JOIN social_accounts sa ON p.account_id = sa.id WHERE p.status = 'scheduled' ORDER BY p.scheduled_at`
- **Recent activity**: `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20`

## Key Tables
- `posts` — id, user_id, account_id, platform, caption, media_type, status, scheduled_at, published_at, error_message, retry_count
- `post_media` — id, post_id, media_url, storage_path, media_type, sort_order
- `social_accounts` — id, user_id, brand_id, platform, username, platform_user_id, access_token, refresh_token, token_expires_at, meta
- `brands` — id, user_id, name, slug, color, avatar_url, drive_folder
- `activity_log` — id, user_id, action, entity_type, entity_id, details, created_at

## Safety Rules
- NEVER run DELETE or DROP without explicit user confirmation
- NEVER expose access_token or refresh_token values — mask them
- Prefer SELECT queries — only mutate when explicitly asked
