import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function getClient(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) {
  const { data } = await supabase
    .from('clients')
    .select('id, portal_active')
    .eq('portal_token', token)
    .single();
  return data;
}

// GET /api/portail/[token]/recurrences
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();
  const client = await getClient(supabase, token);
  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { data, error } = await supabase
    .from('portal_recurring_orders')
    .select('*, delivery_slot:delivery_slots(id, name, start_time, end_time)')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recurrences: data || [] });
}

// POST /api/portail/[token]/recurrences
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();
  const client = await getClient(supabase, token);
  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { nom, days_of_week, delivery_slot_id, items } = await req.json();

  if (!days_of_week?.length || !items?.length) {
    return NextResponse.json({ error: 'Jours et articles requis' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('portal_recurring_orders')
    .insert({
      client_id: client.id,
      nom: nom || null,
      days_of_week,
      delivery_slot_id: delivery_slot_id || null,
      items,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recurrence: data });
}
