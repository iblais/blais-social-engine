import { createAdminClient } from '@/lib/supabase/admin';

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';

interface RefreshResult {
  accessToken: string;
  refreshed: boolean;
}

/**
 * Ensures a valid access token for Instagram/Facebook accounts.
 * Refreshes the token if it's expired or expiring within 24 hours.
 * Returns the current token if still valid.
 */
export async function ensureValidToken(
  accountId: string,
  platform: string,
  currentToken: string,
  refreshToken: string | null,
  tokenExpiresAt: string | null,
): Promise<RefreshResult> {
  // Only refresh Instagram/Facebook tokens
  if (platform !== 'instagram' && platform !== 'facebook') {
    return { accessToken: currentToken, refreshed: false };
  }

  // If no expiration set, try using the current token
  if (!tokenExpiresAt) {
    return { accessToken: currentToken, refreshed: false };
  }

  const expiresAt = new Date(tokenExpiresAt).getTime();
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Token is still valid for more than 24 hours
  if (expiresAt - now > oneDayMs) {
    return { accessToken: currentToken, refreshed: false };
  }

  // Token is expired or expiring soon — refresh it
  if (!refreshToken) {
    throw new Error(
      `${platform} token expired and no refresh token available. Please reconnect your account via Settings > Accounts.`
    );
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      `${platform} token expired. FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are required for token refresh.`
    );
  }

  // For Facebook/Instagram, refresh by exchanging the long-lived user token
  // for a new long-lived token
  const refreshUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  refreshUrl.searchParams.set('grant_type', 'fb_exchange_token');
  refreshUrl.searchParams.set('client_id', appId);
  refreshUrl.searchParams.set('client_secret', appSecret);
  refreshUrl.searchParams.set('fb_exchange_token', refreshToken);

  const res = await fetch(refreshUrl.toString());
  const data = await res.json();

  if (!data.access_token) {
    throw new Error(
      `Failed to refresh ${platform} token: ${data.error?.message || 'Unknown error'}. Please reconnect your account via Settings > Accounts.`
    );
  }

  const newExpiresAt = new Date(
    Date.now() + (data.expires_in || 5184000) * 1000
  ).toISOString();

  // If this is an Instagram account, we need to get the new page token
  // using the refreshed user token
  const supabase = createAdminClient();
  const { data: account } = await supabase
    .from('social_accounts')
    .select('meta')
    .eq('id', accountId)
    .single();

  const pageId = (account?.meta as Record<string, unknown>)?.page_id as string | undefined;
  let newAccessToken = data.access_token;

  if (pageId) {
    // Get updated page access token using the new user token
    const pageRes = await fetch(
      `${GRAPH_BASE}/${pageId}?fields=access_token`,
      { headers: { Authorization: `Bearer ${data.access_token}` } }
    );
    const pageData = await pageRes.json();
    if (pageData.access_token) {
      newAccessToken = pageData.access_token;
    }
  }

  // Update the token in the database
  await supabase
    .from('social_accounts')
    .update({
      access_token: newAccessToken,
      refresh_token: data.access_token, // New user token becomes the refresh token
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  return { accessToken: newAccessToken, refreshed: true };
}
