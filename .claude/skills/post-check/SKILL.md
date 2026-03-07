---
name: post-check
description: Check posting status — find failed posts, diagnose errors, retry stuck posts, view scheduled queue
allowed-tools: Bash, Read
argument-hint: "[failed|scheduled|retry|all]"
---

# Post Status Check & Diagnostics

Check the status of posts in Blais Social Engine and diagnose any failures.

## Quick Commands

Based on `$ARGUMENTS`:

### `failed` (default if no args)
Query all failed posts with error details:
```sql
SELECT p.id, p.caption, p.status, p.error_message, p.retry_count, p.updated_at,
       sa.platform, sa.username
FROM posts p
JOIN social_accounts sa ON p.account_id = sa.id
WHERE p.status IN ('failed', 'retry')
ORDER BY p.updated_at DESC
LIMIT 20
```

### `scheduled`
Show upcoming scheduled posts:
```sql
SELECT p.id, p.caption, p.scheduled_at, p.media_type, sa.platform, sa.username,
       (SELECT count(*) FROM post_media pm WHERE pm.post_id = p.id) as media_count
FROM posts p
JOIN social_accounts sa ON p.account_id = sa.id
WHERE p.status = 'scheduled'
ORDER BY p.scheduled_at ASC
```

### `retry`
Show posts in retry state with backoff timing:
```sql
SELECT p.id, p.caption, p.retry_count, p.error_message, p.updated_at, sa.platform
FROM posts p
JOIN social_accounts sa ON p.account_id = sa.id
WHERE p.status = 'retry'
ORDER BY p.updated_at
```

### `all` or `summary`
Show overall stats:
```sql
SELECT status, count(*) as count FROM posts GROUP BY status ORDER BY count DESC
```

## Diagnosis

After showing results, analyze any errors:
- **Token errors** (190, 401, 403, OAuthException): Tell user to reconnect the account in Settings
- **Rate limit errors**: Note the backoff timing, suggest waiting
- **Media upload errors**: Check if media URLs are accessible
- **"publishing" stuck posts**: These may be orphaned — offer to reset to 'scheduled'

## Connection
Use Supabase Management API:
```
POST https://api.supabase.com/v1/projects/mzwleneitsihjwfzfuho/database/query
```
