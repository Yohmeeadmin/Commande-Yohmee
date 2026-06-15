/**
 * Helpers partagés pour la gestion du stock produits finis.
 * Utilisés par les commandes (réservation) et les BL (sortie réelle).
 */
import { supabase } from '@/lib/supabase/client';

interface OrderItem {
  quantity_ordered: number;
  product_article: { product_reference_id: string | null } | null;
}

async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data } = await supabase
    .from('order_items')
    .select('quantity_ordered, product_article:product_articles(product_reference_id)')
    .eq('order_id', orderId);
  return (data as OrderItem[]) || [];
}

/** Réserve le stock PF quand une commande passe en "confirmée". */
export async function reserverStockPF(orderId: string): Promise<void> {
  const items = await getOrderItems(orderId);
  const date = new Date().toISOString().slice(0, 10);

  for (const item of items) {
    const refId = item.product_article?.product_reference_id;
    if (!refId || item.quantity_ordered <= 0) continue;

    const { data: si } = await supabase
      .from('stock_items')
      .select('id, quantite_reservee')
      .eq('item_type', 'pf')
      .eq('product_reference_id', refId)
      .maybeSingle();

    if (!si) continue;

    await supabase.from('stock_items')
      .update({ quantite_reservee: (si.quantite_reservee || 0) + item.quantity_ordered })
      .eq('id', si.id);

    await supabase.from('stock_movements').insert({
      stock_item_id: si.id,
      type: 'reservation',
      quantite: -item.quantity_ordered,
      date,
      note: 'Réservation commande',
    });
  }
}

/** Déduit le stock PF et libère les réservations quand un BL est émis. */
export async function deduireStockBL(orderId: string | null, utilisateur?: string): Promise<void> {
  if (!orderId) return;
  const items = await getOrderItems(orderId);
  const date = new Date().toISOString().slice(0, 10);

  for (const item of items) {
    const refId = item.product_article?.product_reference_id;
    if (!refId || item.quantity_ordered <= 0) continue;

    const { data: si } = await supabase
      .from('stock_items')
      .select('id, stock_actuel, quantite_reservee')
      .eq('item_type', 'pf')
      .eq('product_reference_id', refId)
      .maybeSingle();

    if (!si) continue;

    await supabase.from('stock_items').update({
      stock_actuel:       Math.max(0, (si.stock_actuel || 0) - item.quantity_ordered),
      quantite_reservee:  Math.max(0, (si.quantite_reservee || 0) - item.quantity_ordered),
    }).eq('id', si.id);

    await supabase.from('stock_movements').insert({
      stock_item_id: si.id,
      type: 'sortie_vente',
      quantite: -item.quantity_ordered,
      date,
      note: 'Sortie BL',
      utilisateur: utilisateur ?? null,
    });
  }
}
