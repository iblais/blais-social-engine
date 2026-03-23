import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Refresh a YouTube (Google) OAuth 2.0 token.
 * Shared between cron post-due and the upload-token API route.
 */
export async function refreshYouTubeToken(
  refreshToken: string,
  supabase: SupabaseClient,
  accountId: string
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`YouTube refresh failed: ${JSON.stringify(data)}`);

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  await supabase.from('social_accounts').update({
    access_token: data.access_token,
    token_expires_at: expiresAt,
  }).eq('id', accountId);

  return data.access_token;
}
