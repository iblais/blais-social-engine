import type { SupabaseClient } from '@supabase/supabase-js';
import { findMatchingRule, renderTemplate, isCooldownActive } from './rules-engine';
import { replyToComment, sendPrivateReply, sendInstagramDM } from '@/lib/instagram/comments';
import type { DmRule } from '@/types/database';

interface WebhookChange {
  field: string;
  value: Record<string, unknown>;
}

/** Process a single webhook event (comment or message) */
export async function processWebhookEvent(
  supabase: SupabaseClient,
  change: WebhookChange
): Promise<void> {
  switch (change.field) {
    case 'comments':
      await processCommentEvent(supabase, change.value);
      break;
    case 'messages':
      await processMessageEvent(supabase, change.value);
      break;
    default:
      console.log(`Unhandled webhook field: ${change.field}`);
  }
}

async function processCommentEvent(
  supabase: SupabaseClient,
  value: Record<string, unknown>
): Promise<void> {
  const commentId = value.id as string;
  const text = value.text as string;
  const mediaId = value.media_id as string || (value.media as { id: string })?.id;
  const from = value.from as { id: string; username: string };

  if (!commentId || !text || !from) return;

  // Check if already processed
  const { data: existing } = await supabase
    .from('comment_tracking')
    .select('id')
    .eq('ig_comment_id', commentId)
    .single();

  if (existing) return;

  // Find the account this comment belongs to
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, platform_user_id, access_token')
    .eq('platform', 'instagram');

  if (!accounts?.length) return;

  // Try each account (webhook doesn't tell us which account received it)
  for (const account of accounts) {
    // Skip self-replies (bot's own comments)
    if (from.id === account.platform_user_id) continue;

    const { data: rules } = await supabase
      .from('dm_rules')
      .select('*')
      .eq('account_id', account.id)
      .eq('is_active', true)
      .eq('trigger_type', 'comment_keyword')
      .order('priority', { ascending: false });

    if (!rules?.length) continue;

    const match = findMatchingRule(text, rules as DmRule[]);
    if (!match) {
      await supabase.from('comment_tracking').insert({
        account_id: account.id,
        post_id: mediaId || '',
        ig_comment_id: commentId,
        ig_user_id: from.id,
        ig_username: from.username,
        comment_text: text,
        processed_at: new Date().toISOString(),
      });
      return;
    }

    // Check cooldown
    const { data: lastTrigger } = await supabase
      .from('comment_tracking')
      .select('processed_at')
      .eq('ig_user_id', from.id)
      .eq('rule_id', match.rule.id)
      .order('processed_at', { ascending: false })
      .limit(1)
      .single();

    if (lastTrigger && isCooldownActive(lastTrigger.processed_at, match.rule.cooldown_minutes)) {
      return;
    }

    const vars = {
      username: from.username,
      keyword: match.matchedKeyword,
      comment: text,
    };

    let replyText: string | null = null;
    let dmSent = false;

    // Reply to comment
    if (match.rule.response_template) {
      replyText = renderTemplate(match.rule.response_template, vars);
      try {
        await replyToComment(commentId, replyText, account.access_token);
      } catch (err) {
        console.error(`Webhook reply failed:`, (err as Error).message);
        replyText = `[FAILED] ${replyText}`;
      }
    }

    // Send DM via private reply (uses comment_id — no prior conversation needed)
    if (match.rule.dm_template) {
      const dmText = renderTemplate(match.rule.dm_template, vars);
      try {
        await sendPrivateReply(account.platform_user_id, commentId, dmText, account.access_token);
        dmSent = true;

        // Track conversation
        await upsertConversation(supabase, account.id, from.id, from.username, dmText);
      } catch (err) {
        console.error(`Webhook DM failed:`, (err as Error).message);
      }
    }

    // Track comment
    await supabase.from('comment_tracking').insert({
      account_id: account.id,
      post_id: mediaId || '',
      ig_comment_id: commentId,
      ig_user_id: from.id,
      ig_username: from.username,
      comment_text: text,
      reply_text: replyText,
      rule_id: match.rule.id,
      dm_sent: dmSent,
      processed_at: new Date().toISOString(),
    });

    return; // Only process once
  }
}

async function processMessageEvent(
  supabase: SupabaseClient,
  value: Record<string, unknown>
): Promise<void> {
  const sender = value.sender as { id: string };
  const recipient = value.recipient as { id: string };
  const message = value.message as { mid: string; text: string };

  if (!sender || !recipient || !message?.text) return;

  // Find the account that received this message
  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, platform_user_id, access_token')
    .eq('platform', 'instagram')
    .eq('platform_user_id', recipient.id)
    .single();

  if (!account) return;

  // Track inbound message
  await upsertConversation(supabase, account.id, sender.id, '', message.text, 'inbound', message.mid);

  // Check DM keyword rules
  const { data: rules } = await supabase
    .from('dm_rules')
    .select('*')
    .eq('account_id', account.id)
    .eq('is_active', true)
    .eq('trigger_type', 'dm_keyword')
    .order('priority', { ascending: false });

  if (!rules?.length) return;

  const match = findMatchingRule(message.text, rules as DmRule[]);
  if (!match) return;

  const vars = {
    username: sender.id,
    keyword: match.matchedKeyword,
    comment: message.text,
  };

  if (match.rule.response_template || match.rule.dm_template) {
    const replyText = renderTemplate(match.rule.dm_template || match.rule.response_template, vars);
    try {
      await sendInstagramDM(account.platform_user_id, sender.id, replyText, account.access_token);
      await upsertConversation(supabase, account.id, sender.id, '', replyText, 'outbound', undefined, match.rule.id);
    } catch (err) {
      console.error(`Webhook DM reply failed:`, (err as Error).message);
    }
  }
}

async function upsertConversation(
  supabase: SupabaseClient,
  accountId: string,
  igUserId: string,
  igUsername: string,
  messageText: string,
  direction: 'inbound' | 'outbound' = 'outbound',
  igMessageId?: string,
  ruleId?: string
): Promise<void> {
  // Upsert conversation
  const { data: conv } = await supabase
    .from('dm_conversations')
    .upsert({
      account_id: accountId,
      ig_user_id: igUserId,
      ig_username: igUsername || igUserId,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,ig_user_id' })
    .select()
    .single();

  if (!conv) return;

  // Insert message
  await supabase.from('dm_messages').insert({
    conversation_id: conv.id,
    direction,
    message_text: messageText,
    rule_id: ruleId || null,
    is_automated: direction === 'outbound',
    ig_message_id: igMessageId || null,
  });

  // Increment message count
  await supabase
    .from('dm_conversations')
    .update({ message_count: (conv.message_count || 0) + 1 })
    .eq('id', conv.id);
}
