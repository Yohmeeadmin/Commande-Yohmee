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

// GET /api/client-assignments?client_id=xxx
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const clientId = request.nextUrl.searchParams.get('client_id');
  if (!clientId) return NextResponse.json({ error: 'client_id requis' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from('client_assignments')
    .select(`
      id, commission_first_order, commission_recurring_pct,
      commission_recurring_months, commission_recurring_until, assigned_at,
      user:profiles(id, first_name, last_name, email)
    `)
    .eq('client_id', clientId)
    .order('assigned_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/client-assignments
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const body = await request.json();
  const { client_id, user_id, commission_first_order, commission_recurring_pct, commission_recurring_months } = body;
  if (!client_id || !user_id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });

  let commission_recurring_until: string | null = null;
  if (commission_recurring_months > 0) {
    const until = new Date();
    until.setMonth(until.getMonth() + Number(commission_recurring_months));
    commission_recurring_until = until.toISOString().split('T')[0];
  }

  const { data, error } = await getSupabaseAdmin()
    .from('client_assignments')
    .insert({
      client_id,
      user_id,
      commission_first_order: commission_first_order || 0,
      commission_recurring_pct: commission_recurring_pct || 0,
      commission_recurring_months: commission_recurring_months || 0,
      commission_recurring_until,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
