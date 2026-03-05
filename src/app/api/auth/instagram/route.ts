import { NextResponse } from 'next/server';

/**
 * Initiates Facebook Login OAuth flow for Instagram Business accounts.
 * Instagram Graph API uses Facebook OAuth — NOT the old Instagram Basic Display API.
 *
 * Required env: META_APP_ID
 * Redirect: /api/auth/instagram/callback
 */
export async function GET() {
  const clientId = process.env.META_APP_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app'}/api/auth/instagram/callback`;

  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ].join(',');

  const url = new URL('https://www.facebook.com/v22.0/dialog/oauth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');

  return NextResponse.redirect(url.toString());
}
