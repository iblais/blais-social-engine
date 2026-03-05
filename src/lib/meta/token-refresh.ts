const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface TokenRefreshResult {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (typically 5184000 = 60 days)
}

/**
 * Exchange a short-lived Meta token for a long-lived one (~60 days),
 * OR refresh an existing long-lived token for a new 60-day token.
 *
 * Works for both Instagram and Facebook tokens.
 * Requires META_APP_ID and META_APP_SECRET env vars.
 */
export async function refreshMetaToken(currentToken: string): Promise<TokenRefreshResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are required for token refresh');
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
 * Debug/inspect a Meta token to check if it's valid and when it expires.
 */
export async function debugMetaToken(token: string): Promise<{
  is_valid: boolean;
  expires_at: number; // unix timestamp
  scopes: string[];
  app_id: string;
  error?: string;
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are required');
  }

  const url = `${GRAPH_BASE}/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    return { is_valid: false, expires_at: 0, scopes: [], app_id: '', error: data.error.message };
  }

  const info = data.data;
  return {
    is_valid: info.is_valid,
    expires_at: info.expires_at || 0,
    scopes: info.scopes || [],
    app_id: info.app_id || '',
  };
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
