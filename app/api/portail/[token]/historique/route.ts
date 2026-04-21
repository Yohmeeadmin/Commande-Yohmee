import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// GET /api/portail/[token]/historique
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: client } = await supabase
    .from('clients')
    .select('id, portal_active')
    .eq('portal_token', params.token)
    .single();

  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, numero, delivery_date, status, total, source,
      delivery_slot:delivery_slots(name, start_time, end_time),
      items:order_items(quantity_ordered, unit_price, product_article:product_articles(display_name))
    `)
    .eq('client_id', client.id)
    .not('status', 'eq', 'annulee')
    .order('delivery_date', { ascending: false })
    .limit(50);

  // Récupère les BL existants pour ces commandes
  const orderIds = (orders || []).map((o: any) => o.id);
  const { data: bls } = orderIds.length > 0
    ? await supabase.from('bons_livraison').select('order_id').in('order_id', orderIds)
    : { data: [] };

  const blOrderIds = new Set((bls || []).map((b: any) => b.order_id));

  return NextResponse.json({
    orders: (orders || []).map((o: any) => ({ ...o, has_bl: blOrderIds.has(o.id) })),
  });
}
