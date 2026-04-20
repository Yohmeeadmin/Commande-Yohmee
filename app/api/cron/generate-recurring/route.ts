import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cette route est appelée chaque soir par Vercel Cron
// Elle génère les commandes du lendemain + passe les clients sans commande depuis 90j en inactif

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Générer les commandes récurrentes pour demain
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toISOString().split('T')[0];

  const { data: ordersCreated, error: recurringError } = await supabase.rpc('generate_orders_from_recurring', {
    target_date: targetDate,
  });

  if (recurringError) {
    console.error('Erreur génération récurrences:', recurringError);
    return NextResponse.json({ error: recurringError.message }, { status: 500 });
  }

  // 2. Appliquer les prix spéciaux clients sur les commandes générées
  if (ordersCreated && ordersCreated > 0) {
    // Récupère les commandes du jour générées + leurs items
    const { data: todayOrders } = await supabase
      .from('orders')
      .select('id, client_id')
      .eq('delivery_date', targetDate);

    if (todayOrders && todayOrders.length > 0) {
      const clientIds = [...new Set(todayOrders.map((o: any) => o.client_id).filter(Boolean))];
      const { data: clientPrices } = await supabase
        .from('client_prices')
        .select('client_id, product_article_id, prix_special')
        .in('client_id', clientIds);

      if (clientPrices && clientPrices.length > 0) {
        for (const order of todayOrders as any[]) {
          const orderPrices = clientPrices.filter((cp: any) => cp.client_id === order.client_id);
          if (orderPrices.length === 0) continue;

          for (const cp of orderPrices) {
            await supabase
              .from('order_items')
              .update({ unit_price: cp.prix_special })
              .eq('order_id', order.id)
              .eq('product_article_id', cp.product_article_id);
          }

          // Recalcule le total de la commande
          const { data: itemsData } = await supabase
            .from('order_items')
            .select('quantity_ordered, unit_price')
            .eq('order_id', order.id);

          if (itemsData) {
            const newTotal = itemsData.reduce((s: number, i: any) => s + i.quantity_ordered * i.unit_price, 0);
            await supabase.from('orders').update({ total: newTotal }).eq('id', order.id);
          }
        }
      }
    }
  }

  // 3. Passer en inactif les clients sans commande depuis 90 jours
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  // Récupérer les clients actifs qui ont commandé récemment
  const { data: recentClientIds } = await supabase
    .from('orders')
    .select('client_id')
    .not('status', 'eq', 'annulee')
    .gte('delivery_date', cutoffStr);

  const activeIds = [...new Set((recentClientIds || []).map((r: any) => r.client_id).filter(Boolean))];

  // Mettre en inactif tous les clients actifs qui ne sont pas dans cette liste
  let deactivatedCount = 0;
  if (activeIds.length > 0) {
    const { data: deactivated } = await supabase
      .from('clients')
      .update({ is_active: false })
      .eq('is_active', true)
      .not('id', 'in', `(${activeIds.map((id: string) => `"${id}"`).join(',')})`)
      .select('id');
    deactivatedCount = deactivated?.length || 0;
  } else {
    // Aucun client n'a commandé dans les 90 derniers jours → tous inactifs
    const { data: deactivated } = await supabase
      .from('clients')
      .update({ is_active: false })
      .eq('is_active', true)
      .select('id');
    deactivatedCount = deactivated?.length || 0;
  }

  console.log(`Récurrences: ${ordersCreated} commande(s) créée(s) pour le ${targetDate}`);
  console.log(`Clients désactivés: ${deactivatedCount}`);

  return NextResponse.json({
    date: targetDate,
    orders_created: ordersCreated,
    clients_deactivated: deactivatedCount,
  });
}
