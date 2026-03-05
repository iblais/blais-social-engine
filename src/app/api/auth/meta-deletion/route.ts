import { NextRequest, NextResponse } from 'next/server';

/**
 * Meta Data Deletion Request callback.
 * Required by Meta for apps using Facebook Login.
 * When a user requests data deletion, Meta pings this URL.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Log the deletion request
  console.log('[meta-deletion] Data deletion request received:', body);

  // Meta expects a JSON response with a confirmation URL and code
  const confirmationCode = `del-${Date.now()}`;

  return NextResponse.json({
    url: `https://blais-social-engine.vercel.app/privacy?deletion=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
