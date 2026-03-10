import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processWebhookEvent } from '@/lib/engagement/webhook-processor';
import crypto from 'crypto';

const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || '';

/** GET: Webhook verification challenge */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/** POST: Receive webhook events with HMAC validation */
export async function POST(req: NextRequest) {
  const body = await req.text();

  // HMAC validation
  if (APP_SECRET) {
    const signature = req.headers.get('x-hub-signature-256');
    if (signature) {
      const expectedSig = 'sha256=' + crypto
        .createHmac('sha256', APP_SECRET)
        .update(body)
        .digest('hex');

      if (signature !== expectedSig) {
        console.error('Webhook HMAC validation failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const supabase = createAdminClient();

  try {
    if (payload.object === 'instagram') {
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          await processWebhookEvent(supabase, change);
        }

        // Handle messaging events
        for (const messaging of entry.messaging || []) {
          await processWebhookEvent(supabase, {
            field: 'messages',
            value: messaging,
          });
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook processing error:', (err as Error).message);
    return NextResponse.json({ status: 'ok' }); // Always 200 to avoid retries
  }
}
