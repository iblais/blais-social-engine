import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchRecentPosts, fetchComments, replyToComment, sendInstagramDM } from '@/lib/instagram/comments';
import { findMatchingRule, renderTemplate, isCooldownActive } from '@/lib/engagement/rules-engine';
import type { DmRule } from '@/types/database';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { account_id } = await req.json();
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });

  // Verify account belongs to user
  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', account_id)
    .eq('user_id', user.id)
    .eq('platform', 'instagram')
    .single();

  if (!account) return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });

  // Get active rules for this account
  const { data: rules } = await supabase
    .from('dm_rules')
    .select('*')
    .eq('account_id', account_id)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (!rules?.length) {
    return NextResponse.json({ message: 'No active rules', processed: 0 });
  }

  const igUserId = account.platform_user_id;
  const accessToken = account.access_token;

  let commentsProcessed = 0;
  let repliesSent = 0;
  let dmsSent = 0;

  try {
    // Fetch recent posts
    const posts = await fetchRecentPosts(igUserId, accessToken, 10);

    for (const post of posts) {
      const comments = await fetchComments(post.id, accessToken, 50);

      for (const comment of comments) {
        // Skip if already processed
        const { data: existing } = await supabase
          .from('comment_tracking')
          .select('id')
          .eq('ig_comment_id', comment.id)
          .single();

        if (existing) continue;

        commentsProcessed++;

        // Find matching rule
        const match = findMatchingRule(comment.text, rules as DmRule[]);
        if (!match) {
          // Track as processed even without a match
          await supabase.from('comment_tracking').insert({
            account_id,
            post_id: post.id,
            ig_comment_id: comment.id,
            ig_user_id: comment.from.id,
            ig_username: comment.from.username,
            comment_text: comment.text,
            processed_at: new Date().toISOString(),
          });
          continue;
        }

        // Check cooldown — last time this rule triggered for this user
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

        // Send comment reply
        if (match.rule.response_template) {
          replyText = renderTemplate(match.rule.response_template, vars);
          try {
            await replyToComment(comment.id, replyText, accessToken);
            repliesSent++;
          } catch (err) {
            console.error(`Reply failed for comment ${comment.id}:`, (err as Error).message);
            replyText = `[FAILED] ${replyText}`;
          }
        }

        // Send DM if template exists
        if (match.rule.dm_template) {
          const dmText = renderTemplate(match.rule.dm_template, vars);
          try {
            await sendInstagramDM(igUserId, comment.from.id, dmText, accessToken);
            dmsSent++;
            dmSentFlag = true;
          } catch (err) {
            console.error(`DM failed for user ${comment.from.id}:`, (err as Error).message);
          }
        }

        // Track the processed comment
        await supabase.from('comment_tracking').insert({
          account_id,
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
      account_id,
      date: today,
      comments_processed: commentsProcessed,
      replies_sent: repliesSent,
      dms_sent: dmsSent,
    }, { onConflict: 'account_id,date' });

    return NextResponse.json({
      success: true,
      commentsProcessed,
      repliesSent,
      dmsSent,
    });
  } catch (err) {
    console.error('Process engagement error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
