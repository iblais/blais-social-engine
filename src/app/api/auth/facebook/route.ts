import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.FACEBOOK_APP_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app'}/api/auth/facebook/callback`;

  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'business_management',
  ].join(',');

  const url = new URL('https://www.facebook.com/v22.0/dialog/oauth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');

  return NextResponse.redirect(url.toString());
}
