import { SupabaseClient } from '@supabase/supabase-js';

export const YT_API = 'https://www.googleapis.com/youtube/v3';

/**
 * Fetch from YouTube Data API with automatic token fallback.
 * If the primary token returns youtubeSignupRequired (Brand Account issue),
 * falls back to any other working YouTube account's token for read operations.
 */
export async function ytApiFetch(
  url: string,
  primaryToken: string,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: Record<string, unknown> | null; error: string | null; status: number }> {
  // Try primary token first
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${primaryToken}` },
  });

  if (res.ok) {
    const data = await res.json();
    return { data, error: null, status: 200 };
  }

  const errBody = await res.json().catch(() => ({}));
  const reason = (errBody?.error?.errors as Array<Record<string, unknown>>)?.[0]?.reason;

  // If youtubeSignupRequired, try a fallback token
  if (reason === 'youtubeSignupRequired') {
    const { data: otherAccounts } = await supabase
      .from('social_accounts')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .eq('is_active', true)
      .neq('access_token', primaryToken)
      .limit(5);

    for (const alt of otherAccounts || []) {
      let token = alt.access_token;

      // Refresh if expired
      if (alt.token_expires_at && new Date(alt.token_expires_at) < new Date() && alt.refresh_token) {
        try {
          const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.YOUTUBE_CLIENT_ID!,
              client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
              refresh_token: alt.refresh_token,
              grant_type: 'refresh_token',
            }),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            token = refreshData.access_token;
          }
        } catch {
          continue;
        }
      }

      const fallbackRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        return { data, error: null, status: 200 };
      }

      const fbErr = await fallbackRes.json().catch(() => ({}));
      const fbReason = (fbErr?.error?.errors as Array<Record<string, unknown>>)?.[0]?.reason;
      if (fbReason !== 'youtubeSignupRequired') {
        // Different error, don't try more fallbacks
        break;
      }
    }

    return {
      data: null,
      error: 'YouTube account requires re-authentication. Go to Settings → Accounts, disconnect and reconnect your YouTube account. When Google shows a channel picker, select your channel.',
      status: 401,
    };
  }

  return {
    data: null,
    error: errBody?.error?.message || `YouTube API error: ${res.status}`,
    status: res.status,
  };
}
