import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data: channels, error } = await supabase
      .from('pipeline_channels')
      .select(`
        *,
        brands:brand_id (name, color, avatar_url),
        social_accounts:youtube_account_id (username, display_name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ channels: channels || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      name, slug, niche, youtube_account_id, brand_id,
      posting_frequency, target_length, tone, shorts_enabled,
      brand_colors, tags_default, sources,
    } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const { data: channel, error } = await supabase
      .from('pipeline_channels')
      .insert({
        user_id: user.id,
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        niche: niche || null,
        youtube_account_id: youtube_account_id || null,
        brand_id: brand_id || null,
        posting_frequency: posting_frequency || null,
        target_length: target_length || null,
        tone: tone || null,
        shorts_enabled: shorts_enabled ?? false,
        brand_colors: brand_colors || null,
        tags_default: tags_default || null,
        sources: sources || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ channel }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, ...fields } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Remove fields that shouldn't be updated directly
    delete fields.user_id;
    delete fields.created_at;

    const { data: channel, error } = await supabase
      .from('pipeline_channels')
      .update(fields)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ channel });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase
      .from('pipeline_channels')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
