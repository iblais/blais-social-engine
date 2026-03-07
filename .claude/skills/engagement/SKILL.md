---
name: engagement
description: Manage Instagram engagement automation — create/edit/delete DM rules, test webhooks, check activity, diagnose DM failures
user-invocable: true
allowed-tools: Read,Grep,Bash,Glob
argument-hint: [create|list|test|status|diagnose]
---

# Engagement Automation Skill

Manage the ManyChat-style comment-to-DM automation system.

## How It Works

1. User posts content with CTA: "Comment KEYWORD to get [thing]"
2. Someone comments the keyword on Instagram
3. Instagram webhook fires → `POST /api/webhooks/instagram`
4. HMAC signature validated with `INSTAGRAM_APP_SECRET`
5. `webhook-processor.ts` loops all accounts, skips self-replies
6. `rules-engine.ts` → `findMatchingRule()` matches keyword with priority ordering
7. `replyToComment()` → public comment reply
8. `sendPrivateReply()` → DM via Private Replies API (`recipient.comment_id`)
9. Tracked in `comment_tracking` + `dm_conversations` + `dm_messages`

## Private Replies API

- **Endpoint**: `POST /{ig-user-id}/messages`
- **Recipient**: `{ "comment_id": "COMMENT_ID" }` (NOT user ID)
- **Limit**: 1 private reply per comment, within 7 days
- **First message**: Text only
- **After user responds**: 24-hour standard messaging window opens
- **Rate limits**: 200 calls per hour per account (messaging combined)

## Commands

### `$ARGUMENTS` = "create"
Create a new engagement rule. Ask for:
- Brand/account to target
- Trigger type: comment_keyword, dm_keyword, story_mention, story_reply
- Keywords (array)
- Match mode: exact, contains, starts_with, regex
- Comment reply template (use `{{username}}`, `{{keyword}}`, `{{comment}}`)
- DM template (same vars)
- Cooldown minutes (default 60)
- Priority (higher = checked first)

Insert into `dm_rules` via Supabase Management API.

### `$ARGUMENTS` = "list"
List all active rules. Query:
```sql
SELECT r.name, r.trigger_type, r.keywords, r.match_mode, r.is_active, r.priority,
       sa.username, b.name as brand
FROM dm_rules r
JOIN social_accounts sa ON r.account_id = sa.id
LEFT JOIN brands b ON sa.brand_id = b.id
ORDER BY b.name, r.priority DESC
```

### `$ARGUMENTS` = "test"
Test the webhook endpoint:
```bash
curl -s -w "\nHTTP Status: %{http_code}" "https://blais-social-engine.vercel.app/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=test123"
```
Also check Vercel runtime logs for recent webhook POSTs.

### `$ARGUMENTS` = "status"
Show engagement system status:
- Recent webhook activity (Vercel logs)
- Recent comment_tracking entries
- Active rules count per brand
- Any failed DMs or errors

### `$ARGUMENTS` = "diagnose"
Diagnose DM failures. Common issues:
1. **"Outside of allowed window"** → Using `recipient.id` instead of `recipient.comment_id`. Must use Private Replies API.
2. **403 Forbidden on webhook verify** → Check `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` env var in Vercel. Watch for trailing newlines.
3. **Webhook not firing** → App must be in Published state. Account must have token generated in Meta Dev Console Step 2.
4. **Rule not matching** → Check webhook processor loop — ensure it `continue`s (not `return`s) when no match found on first account.
5. **Self-reply loop** → `webhook-processor.ts` should skip comments where `from.id === account.platform_user_id`.

## Key Files

- `src/app/api/webhooks/instagram/route.ts` — Webhook endpoint
- `src/lib/engagement/webhook-processor.ts` — Event processing
- `src/lib/engagement/rules-engine.ts` — Keyword matching
- `src/lib/instagram/comments.ts` — replyToComment, sendPrivateReply, sendInstagramDM
- `src/lib/instagram/messaging.ts` — sendDM, sendImageDM, getConversation
- `src/lib/engagement/ai-responder.ts` — Gemini AI replies
- `src/app/(dashboard)/engagement/page.tsx` — Engagement dashboard (4 tabs)

## Database Tables

- `dm_rules` — trigger_type, keywords[], match_mode, response_template, dm_template, cooldown_minutes, priority
- `dm_conversations` — account_id, ig_user_id, ig_username, last_message_at, message_count
- `dm_messages` — conversation_id, direction, message_text, rule_id, is_automated
- `comment_tracking` — ig_comment_id, ig_username, comment_text, reply_text, dm_sent, rule_id
- `engagement_stats` — account_id, date, comments_processed, dms_sent, rules_triggered

## Env Vars Required

- `INSTAGRAM_APP_SECRET` — HMAC webhook validation
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` — Webhook verification challenge
