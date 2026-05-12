import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendWhatsApp, sendWhatsAppImage } from '@/lib/whatsapp';

// POST /api/portail/[token]/commandes
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data: client } = await supabase
    .from('clients')
    .select('id, nom, telephone, portal_active')
    .eq('portal_token', token)
    .single();

  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { items, delivery_date, delivery_slot_id, note } = await req.json();

  if (!items?.length || !delivery_date) return NextResponse.json({ error: 'Données manquantes' }, { status: 400 });

  const { data: settingsRow } = await supabase
    .from('app_settings')
    .select('portal_order_deadline')
    .eq('id', 1)
    .single();

  const deadline: string = (settingsRow as any)?.portal_order_deadline ?? '18:00:00';
  const [dh, dm] = deadline.split(':').map(Number);
  const now = new Date();
  const afterDeadline = now.getHours() > dh || (now.getHours() === dh && now.getMinutes() >= dm);
  const status = afterDeadline ? 'brouillon' : 'confirmee';

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      client_id: client.id,
      delivery_date,
      delivery_slot_id: delivery_slot_id || null,
      status,
      source: 'portail',
      note: note || null,
      total: 0,
    })
    .select('id, numero')
    .single();

  if (orderError || !orderData) return NextResponse.json({ error: orderError?.message || 'Erreur création commande' }, { status: 500 });

  const lines = items.map((item: any) => ({
    order_id: orderData.id,
    product_article_id: item.article_id,
    quantity_ordered: item.quantity,
    unit_price: item.unit_price,
    article_unit_quantity: item.unit_quantity ?? 1,
    is_echantillon: false,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(lines);
  if (itemsError) {
    await supabase.from('orders').delete().eq('id', orderData.id);
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const total = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0);
  await supabase.from('orders').update({ total }).eq('id', orderData.id);

  // ── WhatsApp confirmation ──────────────────────────────────────────────────
  if (client.telephone) {
    const { data: settings } = await supabase.from('app_settings').select('logo_url, company_name').eq('id', 1).single();
    const logoUrl = (settings as any)?.logo_url ?? null;
    const companyName = (settings as any)?.company_name ?? 'BDK';

    const dateFormatted = new Date(delivery_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const lignes = items
      .map((i: any) => `• *${i.display_name ?? 'Article'}* × ${i.quantity} — ${(i.quantity * i.unit_price).toFixed(2)} MAD`)
      .join('\n');

    const message = [
      `✅ *Bonjour ${client.nom ?? ''} !*`,
      `Votre commande *${companyName}* est confirmée.`,
      ``,
      `📅 *Livraison :* ${dateFormatted}`,
      ``,
      lignes,
      ``,
      `💰 *Total : ${total.toFixed(2)} MAD*`,
      note ? `📝 _Note : ${note}_` : '',
      ``,
      `_Merci pour votre confiance 🙏_`,
    ].filter(l => l !== undefined && l !== null).join('\n');

    if (logoUrl) {
      const sent = await sendWhatsAppImage(client.telephone, logoUrl, message);
      if (!sent) await sendWhatsApp(client.telephone, message);
    } else {
      await sendWhatsApp(client.telephone, message);
    }
  }

  return NextResponse.json({
    success: true,
    order_id: orderData.id,
    numero: orderData.numero,
    status,
    pending_validation: afterDeadline,
  });
}
