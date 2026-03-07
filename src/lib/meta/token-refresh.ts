const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface TokenRefreshResult {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (typically 5184000 = 60 days)
}

/**
 * Refresh an Instagram Login long-lived token.
 * Uses the Instagram Platform API refresh endpoint.
 * Tokens must be at least 24 hours old and not expired to refresh.
 */
export async function refreshInstagramToken(currentToken: string): Promise<TokenRefreshResult> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `Instagram token refresh failed: ${data.error?.message || res.statusText}`
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || 'bearer',
    expires_in: data.expires_in || 5184000,
  };
}

/**
 * Refresh a Meta/Facebook long-lived token.
 * Requires META_APP_ID and META_APP_SECRET env vars.
 */
export async function refreshMetaToken(currentToken: string): Promise<TokenRefreshResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are required for Meta token refresh');
  }

  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', currentToken);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `Meta token refresh failed: ${data.error?.message || res.statusText}`
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || 'bearer',
    expires_in: data.expires_in || 5184000,
  };
}

/**
 * Refresh a Facebook Page token by refreshing the long-lived user token
 * and then fetching fresh page tokens.
 * The refresh_token stored on facebook_login accounts is the long-lived user token.
 */
export async function refreshFacebookPageToken(
  refreshToken: string,
  pageId: string,
): Promise<TokenRefreshResult & { new_user_token: string }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are required for Facebook token refresh');
  }

  // Step 1: Exchange current long-lived user token for a new one
  const llRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: refreshToken,
      })
  );
  const llData = await llRes.json();

  if (!llData.access_token) {
    throw new Error(
      `Facebook user token refresh failed: ${llData.error?.message || JSON.stringify(llData)}`
    );
  }

  // Step 2: Get fresh page tokens using the new long-lived user token
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,access_token&access_token=${llData.access_token}`
  );
  const pagesData = await pagesRes.json();
  const pages = pagesData.data || [];

  const page = pages.find((p: { id: string }) => p.id === pageId);
  if (!page) {
    throw new Error(`Facebook page ${pageId} not found in user's pages`);
  }

  return {
    access_token: page.access_token,
    token_type: 'bearer',
    expires_in: llData.expires_in || 5184000, // 60 days
    new_user_token: llData.access_token,
  };
}

/**
 * Smart refresh — detects auth method from account meta and uses correct endpoint.
 */
export async function refreshAccountToken(
  currentToken: string,
  meta?: Record<string, unknown> | null
): Promise<TokenRefreshResult> {
  const authMethod = meta?.auth_method;

  if (authMethod === 'instagram_login') {
    return refreshInstagramToken(currentToken);
  }

  // Default to Meta/Facebook token refresh
  return refreshMetaToken(currentToken);
}

/**
 * Check if a token needs refreshing (expired or expiring within 7 days).
 */
export function tokenNeedsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) return true; // unknown expiry — try to refresh
  const expiryDate = new Date(expiresAt);
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return expiryDate <= sevenDaysFromNow;
}
