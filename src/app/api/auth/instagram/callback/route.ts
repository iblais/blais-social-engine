import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';

/**
 * Instagram OAuth callback — handles the Facebook Login redirect.
 *
 * Flow:
 * 1. Exchange code for short-lived user token
 * 2. Exchange short-lived for long-lived user token (60 days)
 * 3. Get user's Facebook Pages
 * 4. For each Page, get linked Instagram Business Account
 * 5. Store accounts in Supabase with refresh capability
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
  const redirectUri = `${appUrl}/api/auth/instagram/callback`;

  try {
    // Step 1: Exchange code for short-lived token
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=token_exchange_failed', req.url)
      );
    }

    // Step 2: Exchange for long-lived token (60 days)
    const longLivedUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', appId);
    longLivedUrl.searchParams.set('client_secret', appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', tokenData.access_token);

    const llRes = await fetch(longLivedUrl.toString());
    const llData = await llRes.json();

    const longLivedToken = llData.access_token || tokenData.access_token;
    const expiresIn = llData.expires_in || 5184000; // default 60 days

    // Step 3: Get user's Facebook Pages
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data?.length) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=no_pages', req.url)
      );
    }

    // Supabase admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user ID
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    const userId = profiles?.[0]?.id;

    if (!userId) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=no_user', req.url)
      );
    }

    const connectedAccounts: string[] = [];
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    for (const page of pagesData.data) {
      const igAccount = page.instagram_business_account;

      // Save Facebook Page
      const { data: existingFb } = await supabase
        .from('social_accounts')
        .select('id')
        .eq('platform', 'facebook')
        .eq('platform_user_id', page.id)
        .single();

      const fbData = {
        access_token: page.access_token, // Page tokens from long-lived user tokens are long-lived
        refresh_token: longLivedToken, // Store user token as refresh — can re-fetch page tokens
        token_expires_at: tokenExpiresAt,
        username: page.name,
        display_name: page.name,
        is_active: true,
        meta: { app_id: appId, page_id: page.id },
      };

      if (existingFb) {
        await supabase.from('social_accounts').update(fbData).eq('id', existingFb.id);
      } else {
        await supabase.from('social_accounts').insert({
          user_id: userId,
          platform: 'facebook' as const,
          platform_user_id: page.id,
          ...fbData,
        });
      }
      connectedAccounts.push(`FB: ${page.name}`);

      // Save Instagram Business Account (if linked)
      if (igAccount) {
        const { data: existingIg } = await supabase
          .from('social_accounts')
          .select('id')
          .eq('platform', 'instagram')
          .eq('platform_user_id', igAccount.id)
          .single();

        const igData = {
          access_token: page.access_token, // IG uses the page token
          refresh_token: longLivedToken,
          token_expires_at: tokenExpiresAt,
          username: igAccount.username || igAccount.name,
          display_name: igAccount.name || igAccount.username,
          avatar_url: igAccount.profile_picture_url || null,
          is_active: true,
          meta: { app_id: appId, page_id: page.id, ig_user_id: igAccount.id },
        };

        if (existingIg) {
          await supabase.from('social_accounts').update(igData).eq('id', existingIg.id);
        } else {
          await supabase.from('social_accounts').insert({
            user_id: userId,
            platform: 'instagram' as const,
            platform_user_id: igAccount.id,
            ...igData,
          });
        }
        connectedAccounts.push(`IG: @${igAccount.username || igAccount.name}`);
      }
    }

    const summary = encodeURIComponent(connectedAccounts.join(', '));
    return NextResponse.redirect(
      new URL(`/settings/accounts?success=instagram&connected=${summary}`, req.url)
    );
  } catch (err) {
    console.error('Instagram OAuth error:', err);
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent((err as Error).message)}`, req.url)
    );
  }
}
