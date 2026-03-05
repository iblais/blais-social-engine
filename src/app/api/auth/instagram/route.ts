import { NextResponse } from 'next/server';

/**
 * Initiates Instagram Business Login (direct Instagram OAuth).
 * Uses the Instagram Platform API — NOT Facebook Login.
 *
 * Required env: INSTAGRAM_APP_ID
 */
export async function GET() {
  const clientId = process.env.INSTAGRAM_APP_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'INSTAGRAM_APP_ID not configured' }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app').trim();
  const redirectUri = `${appUrl}/api/auth/instagram/callback`;

  const scopes = [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
    'instagram_business_manage_messages',
  ].join(',');

  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_authentication', '1');

  return NextResponse.redirect(url.toString());
}
