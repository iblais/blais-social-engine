import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Facebook OAuth callback.
 *
 * Flow:
 * 1. Exchange code for user access token
 * 2. Exchange for long-lived user token (60 days)
 * 3. Get list of Pages the user manages
 * 4. For each Page, get a Page Access Token (never expires!)
 * 5. Store each Page as a facebook social_account
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings/accounts?error=no_code', req.url)
    );
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app').trim();
  const redirectUri = `${appUrl}/api/auth/facebook/callback`;

  try {
    // Step 1: Exchange code for short-lived user token
    const tokenRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        })
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('FB token exchange failed:', tokenData);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=token_exchange_failed', req.url)
      );
    }

    // Step 2: Exchange for long-lived user token (60 days)
    const llRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: tokenData.access_token,
        })
    );
    const llData = await llRes.json();
    const longLivedUserToken = llData.access_token || tokenData.access_token;
    console.log(`FB OAuth: got long-lived token (length: ${longLivedUserToken.length})`);

    // Step 3: Get Pages the user manages
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,picture&access_token=${longLivedUserToken}`
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];

    console.log(`FB OAuth: found ${pages.length} pages:`, pages.map((p: { id: string; name: string }) => `${p.name} (${p.id})`));

    if (!pages.length) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=no_pages_found', req.url)
      );
    }

    // Get authenticated user
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();
    const userId = user?.id;

    if (!userId) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=no_user', req.url)
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Step 4: Store each Page — Page Access Tokens from long-lived user tokens NEVER expire
    const connectedPages: string[] = [];

    for (const page of pages) {
      const pageId = page.id;
      const pageName = page.name;
      const pageToken = page.access_token; // This is a non-expiring Page Access Token
      const avatarUrl = page.picture?.data?.url || null;

      const accountData = {
        user_id: userId,
        platform: 'facebook' as const,
        platform_user_id: pageId,
        access_token: pageToken,
        refresh_token: longLivedUserToken,
        token_expires_at: null,
        username: pageName,
        display_name: pageName,
        avatar_url: avatarUrl,
        is_active: true,
        updated_at: new Date().toISOString(),
        meta: {
          auth_method: 'facebook_login',
          page_id: pageId,
          meta_app_id: appId,
        },
      };

      const { error: upsertErr } = await supabase
        .from('social_accounts')
        .upsert(accountData, { onConflict: 'user_id,platform,platform_user_id' });

      if (upsertErr) {
        console.error(`FB upsert failed for ${pageName} (${pageId}):`, JSON.stringify(upsertErr));
      }

      connectedPages.push(pageName);
    }

    return NextResponse.redirect(
      new URL(
        `/settings/accounts?success=facebook&connected=${encodeURIComponent(connectedPages.join(', '))}`,
        req.url
      )
    );
  } catch (err) {
    console.error('Facebook OAuth error:', err);
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent((err as Error).message)}`, req.url)
    );
  }
}
