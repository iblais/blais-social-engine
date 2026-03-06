import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('dm_rules')
    .select('*')
    .eq('user_id', user.id)
    .order('priority', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, account_id, trigger_type, keywords, match_mode, response_template, dm_template, ai_enabled, ai_prompt, cooldown_minutes, priority } = body;

  if (!name || !account_id || !keywords?.length) {
    return NextResponse.json({ error: 'Name, account, and keywords are required' }, { status: 400 });
  }

  const { data, error } = await supabase.from('dm_rules').insert({
    user_id: user.id,
    account_id,
    name,
    trigger_type: trigger_type || 'comment_keyword',
    keywords,
    match_mode: match_mode || 'contains',
    response_template: response_template || '',
    dm_template: dm_template || null,
    ai_enabled: ai_enabled || false,
    ai_prompt: ai_prompt || null,
    cooldown_minutes: cooldown_minutes || 60,
    priority: priority || 0,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('dm_rules')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });

  const { error } = await supabase
    .from('dm_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
