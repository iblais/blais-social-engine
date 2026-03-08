import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data: responses, error } = await supabase
      .from('canned_responses')
      .select('id, label, text, category')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ responses: responses || [] });
  } catch (err) {
    console.error('Canned responses GET error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { label, text, category } = await req.json();
  if (!label || !text) {
    return NextResponse.json({ error: 'Label and text are required' }, { status: 400 });
  }

  try {
    const { data: response, error } = await supabase
      .from('canned_responses')
      .insert({
        user_id: user.id,
        label: label.trim(),
        text: text.trim(),
        category: (category || 'general').trim(),
      })
      .select('id, label, text, category')
      .single();

    if (error) throw error;
    return NextResponse.json({ response });
  } catch (err) {
    console.error('Canned responses POST error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

  try {
    const { error } = await supabase
      .from('canned_responses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Canned responses DELETE error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
