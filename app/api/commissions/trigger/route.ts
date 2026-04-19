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

// POST /api/commissions/trigger
// body: { order_id, client_id }
// Appelé lors de la génération d'un BL. Crée les entrées de commission idempotent.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { order_id, client_id } = await request.json();
  if (!order_id || !client_id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });

  // Récupère les assignments pour ce client
  const { data: assignments } = await getSupabaseAdmin()
    .from('client_assignments')
    .select('*')
    .eq('client_id', client_id);

  if (!assignments || assignments.length === 0) return NextResponse.json({ created: 0 });

  // Calcule le montant réellement livré
  const { data: items } = await getSupabaseAdmin()
    .from('order_items')
    .select('quantity_delivered, quantity_ordered, unit_price')
    .eq('order_id', order_id);

  const blTotal = (items || []).reduce((sum: number, item: any) => {
    const qty = item.quantity_delivered ?? item.quantity_ordered;
    return sum + qty * item.unit_price;
  }, 0);

  if (blTotal === 0) return NextResponse.json({ created: 0 });

  // Récupère la date de livraison
  const { data: order } = await getSupabaseAdmin()
    .from('orders')
    .select('delivery_date')
    .eq('id', order_id)
    .single();

  const orderDate = order?.delivery_date ?? new Date().toISOString().split('T')[0];
  let created = 0;

  for (const assignment of assignments) {
    // Idempotence : déjà traité pour cet order ?
    const { data: existingForOrder } = await getSupabaseAdmin()
      .from('commissions')
      .select('id')
      .eq('order_id', order_id)
      .eq('assignment_id', assignment.id);

    if (existingForOrder && existingForOrder.length > 0) continue;

    const toInsert: any[] = [];

    // Commission première commande (une seule fois par commercial + client)
    if (Number(assignment.commission_first_order) > 0) {
      const { data: prior } = await getSupabaseAdmin()
        .from('commissions')
        .select('id')
        .eq('assignment_id', assignment.id)
        .eq('type', 'first_order')
        .limit(1);

      if (!prior || prior.length === 0) {
        toInsert.push({
          user_id: assignment.user_id,
          client_id,
          order_id,
          assignment_id: assignment.id,
          type: 'first_order',
          amount: Math.round(blTotal * Number(assignment.commission_first_order)) / 100,
          rate: Number(assignment.commission_first_order),
          status: 'pending',
        });
      }
    }

    // Commission récurrente (toutes commandes pendant la période)
    if (
      Number(assignment.commission_recurring_pct) > 0 &&
      assignment.commission_recurring_until &&
      orderDate <= assignment.commission_recurring_until
    ) {
      toInsert.push({
        user_id: assignment.user_id,
        client_id,
        order_id,
        assignment_id: assignment.id,
        type: 'recurring',
        amount: Math.round(blTotal * Number(assignment.commission_recurring_pct)) / 100,
        rate: Number(assignment.commission_recurring_pct),
        status: 'pending',
      });
    }

    if (toInsert.length > 0) {
      await getSupabaseAdmin().from('commissions').insert(toInsert);
      created += toInsert.length;
    }
  }

  return NextResponse.json({ created });
}
