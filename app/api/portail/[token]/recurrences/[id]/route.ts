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

// PATCH /api/portail/[token]/recurrences/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string; id: string } }
) {
  const supabase = getSupabaseAdmin();
  const client = await getClient(supabase, params.token);
  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const body = await req.json();

  // Only allow updating these fields
  const allowed = ['is_active', 'nom', 'days_of_week', 'delivery_slot_id', 'items'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from('portal_recurring_orders')
    .update(updates)
    .eq('id', params.id)
    .eq('client_id', client.id) // ensure ownership
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recurrence: data });
}

// DELETE /api/portail/[token]/recurrences/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { token: string; id: string } }
) {
  const supabase = getSupabaseAdmin();
  const client = await getClient(supabase, params.token);
  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { error } = await supabase
    .from('portal_recurring_orders')
    .delete()
    .eq('id', params.id)
    .eq('client_id', client.id); // ensure ownership

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
