import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function getAuthUser(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/commissions?start=&end=
// Admin → toutes les commissions. Commercial → uniquement les siennes.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const params = request.nextUrl.searchParams;
  const start = params.get('start');
  const end = params.get('end');

  let query = getSupabaseAdmin()
    .from('commissions')
    .select(`
      id, type, amount, rate, status, bl_generated_at, created_at,
      user:profiles(id, first_name, last_name),
      client:clients(id, nom, raison_sociale, code),
      order:orders(id, numero, delivery_date, total)
    `)
    .order('created_at', { ascending: false });

  if (!isAdmin) query = query.eq('user_id', user.id);
  if (start) query = query.gte('created_at', start);
  if (end) query = query.lte('created_at', `${end}T23:59:59`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, isAdmin });
}

// PATCH /api/commissions — valide ou marque payée (admin seulement)
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { ids, status } = await request.json();
  if (!ids?.length || !status) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from('commissions')
    .update({ status })
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
