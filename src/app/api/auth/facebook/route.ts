import { NextResponse } from 'next/server';

/**
 * Initiates Facebook Login OAuth flow.
 * Gets permissions for Facebook Pages management + posting.
 */
export async function GET() {
  const clientId = process.env.META_APP_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app').trim();
  const redirectUri = `${appUrl}/api/auth/facebook/callback`;

  const scopes = [
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
  ].join(',');

  const url = new URL('https://www.facebook.com/v22.0/dialog/oauth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');

  return NextResponse.redirect(url.toString());
}
