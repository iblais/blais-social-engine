import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const itemId = req.nextUrl.searchParams.get('item');

  if (!url) return NextResponse.redirect(new URL('/', req.url));

  try {
    const supabase = await createClient();

    // Get the smartlink from the item
    if (itemId) {
      const { data: item } = await supabase
        .from('smartlink_items')
        .select('smartlink_id')
        .eq('id', itemId)
        .single();

      if (item) {
        // Track click
        await supabase.from('smartlink_clicks').insert({
          smartlink_id: item.smartlink_id,
          item_id: itemId,
          referrer: req.headers.get('referer') || null,
          user_agent: req.headers.get('user-agent') || null,
        });

        // Increment click count on item
        const { error: rpcError } = await supabase.rpc('increment_clicks', { row_id: itemId });
        if (rpcError) {
          // Fallback if RPC doesn't exist — just increment manually
          const { data: current } = await supabase
            .from('smartlink_items')
            .select('clicks')
            .eq('id', itemId)
            .single();
          await supabase
            .from('smartlink_items')
            .update({ clicks: (current?.clicks || 0) + 1 })
            .eq('id', itemId);
        }
      }
    }
  } catch {
    // Don't block redirect on tracking errors
  }

  return NextResponse.redirect(url);
}
