import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.YOUTUBE_CLIENT_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'https://blais-social-engine.vercel.app' : 'http://localhost:3000'}/api/auth/youtube/callback`;

  const scopes = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ].join(' ');

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(url.toString());
}
