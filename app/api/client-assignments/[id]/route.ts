import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function verifyAdmin(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

// PATCH /api/client-assignments/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { commission_first_order, commission_recurring_pct, commission_recurring_months } = body;

  let commission_recurring_until: string | null = null;
  if (commission_recurring_months > 0) {
    const { data: existing } = await getSupabaseAdmin()
      .from('client_assignments')
      .select('assigned_at')
      .eq('id', id)
      .single();
    const base = existing?.assigned_at ? new Date(existing.assigned_at) : new Date();
    base.setMonth(base.getMonth() + Number(commission_recurring_months));
    commission_recurring_until = base.toISOString().split('T')[0];
  }

  const { error } = await getSupabaseAdmin()
    .from('client_assignments')
    .update({ commission_first_order, commission_recurring_pct, commission_recurring_months, commission_recurring_until })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/client-assignments/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('client_assignments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
