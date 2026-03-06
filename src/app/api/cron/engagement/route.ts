import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchRecentPosts, fetchComments, replyToComment, sendInstagramDM } from '@/lib/instagram/comments';
import { findMatchingRule, renderTemplate, isCooldownActive } from '@/lib/engagement/rules-engine';
import type { DmRule } from '@/types/database';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get all active rules with their accounts
  const { data: rules } = await supabase
    .from('dm_rules')
    .select('*, social_accounts!inner(id, platform_user_id, access_token, platform)')
    .eq('is_active', true)
    .eq('social_accounts.platform', 'instagram');

  if (!rules?.length) {
    return NextResponse.json({ message: 'No active rules', processed: 0 });
  }

  // Group rules by account
  const accountRules = new Map<string, { igUserId: string; accessToken: string; rules: DmRule[] }>();

  for (const rule of rules) {
    const acc = (rule as Record<string, unknown>).social_accounts as { id: string; platform_user_id: string; access_token: string };
    if (!accountRules.has(rule.account_id)) {
      accountRules.set(rule.account_id, {
        igUserId: acc.platform_user_id,
        accessToken: acc.access_token,
        rules: [],
      });
    }
    accountRules.get(rule.account_id)!.rules.push(rule as DmRule);
  }

  let totalComments = 0;
  let totalReplies = 0;
  let totalDMs = 0;

  for (const [accountId, { igUserId, accessToken, rules: accountRuleList }] of accountRules) {
    try {
      const posts = await fetchRecentPosts(igUserId, accessToken, 10);

      for (const post of posts) {
        const comments = await fetchComments(post.id, accessToken, 50);

        for (const comment of comments) {
          const { data: existing } = await supabase
            .from('comment_tracking')
            .select('id')
            .eq('ig_comment_id', comment.id)
            .single();

          if (existing) continue;
          totalComments++;

          const match = findMatchingRule(comment.text, accountRuleList);
          if (!match) {
            await supabase.from('comment_tracking').insert({
              account_id: accountId,
              post_id: post.id,
              ig_comment_id: comment.id,
              ig_user_id: comment.from.id,
              ig_username: comment.from.username,
              comment_text: comment.text,
              processed_at: new Date().toISOString(),
            });
            continue;
          }

          const { data: lastTrigger } = await supabase
            .from('comment_tracking')
            .select('processed_at')
            .eq('ig_user_id', comment.from.id)
            .eq('rule_id', match.rule.id)
            .order('processed_at', { ascending: false })
            .limit(1)
            .single();

          if (lastTrigger && isCooldownActive(lastTrigger.processed_at, match.rule.cooldown_minutes)) {
            continue;
          }

          const vars = {
            username: comment.from.username,
            keyword: match.matchedKeyword,
            comment: comment.text,
          };

          let replyText: string | null = null;
          let dmSentFlag = false;

          if (match.rule.response_template) {
            replyText = renderTemplate(match.rule.response_template, vars);
            try {
              await replyToComment(comment.id, replyText, accessToken);
              totalReplies++;
            } catch (err) {
              console.error(`Cron reply failed:`, (err as Error).message);
              replyText = `[FAILED] ${replyText}`;
            }
          }

          if (match.rule.dm_template) {
            const dmText = renderTemplate(match.rule.dm_template, vars);
            try {
              await sendInstagramDM(igUserId, comment.from.id, dmText, accessToken);
              totalDMs++;
              dmSentFlag = true;
            } catch (err) {
              console.error(`Cron DM failed:`, (err as Error).message);
            }
          }

          await supabase.from('comment_tracking').insert({
            account_id: accountId,
            post_id: post.id,
            ig_comment_id: comment.id,
            ig_user_id: comment.from.id,
            ig_username: comment.from.username,
            comment_text: comment.text,
            reply_text: replyText,
            rule_id: match.rule.id,
            dm_sent: dmSentFlag,
            processed_at: new Date().toISOString(),
          });
        }
      }

      // Update daily stats
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('engagement_stats').upsert({
        account_id: accountId,
        date: today,
        comments_processed: totalComments,
        replies_sent: totalReplies,
        dms_sent: totalDMs,
      }, { onConflict: 'account_id,date' });

    } catch (err) {
      console.error(`Cron engagement error for account ${accountId}:`, (err as Error).message);
    }
  }

  return NextResponse.json({
    success: true,
    accounts: accountRules.size,
    totalComments,
    totalReplies,
    totalDMs,
  });
}
