import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createHmac } from 'crypto';

// ─── Vérification signature WooCommerce ──────────────────────────────────────

function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!secret) return true; // pas de secret configuré → on accepte (dev)
  const expected = createHmac('sha256', secret).update(body).digest('base64');
  return expected === signature;
}

// ─── Mapping statut WC → BDK ─────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  completed:  'livree',
  processing: 'confirmee',
  'on-hold':  'confirmee',
  pending:    'brouillon',
  cancelled:  'annulee',
  refunded:   'annulee',
  failed:     'annulee',
};

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-wc-webhook-signature') ?? '';
  const topic = req.headers.get('x-wc-webhook-topic') ?? '';
  const companyId = req.nextUrl.searchParams.get('company_id');

  if (!companyId) {
    return NextResponse.json({ error: 'company_id manquant' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Récupérer l'entreprise et son secret webhook
  const { data: company } = await supabase
    .from('companies')
    .select('id, slug, woocommerce_webhook_secret')
    .eq('id', companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });
  }

  // Vérifier la signature
  if (company.woocommerce_webhook_secret && !verifySignature(rawBody, signature, company.woocommerce_webhook_secret)) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  // On traite uniquement les créations et mises à jour de commandes
  if (!topic.startsWith('order.')) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let wo: any;
  try {
    wo = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  // ── Trouver ou créer le client ────────────────────────────────────────────
  const billing = wo.billing ?? {};
  const phone = billing.phone?.replace(/\s+/g, '') ?? null;

  if (!phone) {
    return NextResponse.json({ ok: false, error: 'Téléphone manquant dans la commande' }, { status: 422 });
  }

  const nom = billing.company ||
    `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim() ||
    billing.email || phone;

  const adresse = [billing.address_1, billing.address_2].filter(Boolean).join(', ') || null;

  let clientId: string;
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('telephone', phone)
    .eq('company_id', companyId)
    .maybeSingle();

  if (existingClient) {
    clientId = existingClient.id;
  } else {
    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        nom,
        email: billing.email || null,
        telephone: phone,
        adresse_livraison: adresse,
        ville: billing.city || null,
        is_active: true,
        company_id: companyId,
      })
      .select('id')
      .single();

    if (clientErr || !newClient) {
      return NextResponse.json({ error: `Impossible de créer le client: ${clientErr?.message}` }, { status: 500 });
    }
    clientId = newClient.id;
  }

  // ── Créer ou mettre à jour la commande ────────────────────────────────────
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('woocommerce_order_id', wo.id)
    .maybeSingle();

  // Debug : afficher les meta_data pour trouver la clé "Heure de récupération"
  const metaKeys = (wo.meta_data ?? []).map((m: any) => ({ key: m.key, value: m.value }));
  console.log('[WC webhook] meta_data order', wo.id, JSON.stringify(metaKeys));

  // Chercher l'heure de récupération dans meta_data
  const heureRecupMeta = (wo.meta_data ?? []).find((m: any) =>
    m.key?.toLowerCase().includes('recuper') ||
    m.key?.toLowerCase().includes('pickup') ||
    m.key?.toLowerCase().includes('heure') ||
    m.key?.toLowerCase().includes('delivery_time') ||
    m.key?.toLowerCase().includes('livraison_date')
  );
  console.log('[WC webhook] heureRecup candidate:', JSON.stringify(heureRecupMeta));

  const deliveryDate = (wo.date_completed || wo.date_created || '').slice(0, 10)
    || new Date().toISOString().slice(0, 10);
  const status = STATUS_MAP[wo.status] ?? 'confirmee';

  let orderId: string;

  if (existingOrder) {
    // Mettre à jour le statut uniquement
    await supabase.from('orders').update({ status }).eq('id', existingOrder.id);
    orderId = existingOrder.id;
    return NextResponse.json({ ok: true, action: 'updated', order_id: orderId });
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      client_id: clientId,
      delivery_date: deliveryDate,
      status,
      note: wo.customer_note || null,
      woocommerce_order_id: wo.id,
    })
    .select('id')
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: `Impossible de créer la commande: ${orderErr?.message}` }, { status: 500 });
  }
  orderId = order.id;

  // ── Lignes de commande ────────────────────────────────────────────────────
  for (const item of (wo.line_items ?? [])) {
    let articleId: string | null = null;

    if (item.variation_id && item.variation_id !== 0) {
      const { data: art } = await supabase
        .from('product_articles')
        .select('id')
        .eq('woocommerce_variation_id', item.variation_id)
        .maybeSingle();
      articleId = art?.id ?? null;
    }

    if (!articleId) {
      const { data: ref } = await supabase
        .from('product_references')
        .select('id')
        .eq('woocommerce_product_id', item.product_id)
        .maybeSingle();
      if (ref) {
        const { data: art } = await supabase
          .from('product_articles')
          .select('id')
          .eq('product_reference_id', ref.id)
          .limit(1)
          .maybeSingle();
        articleId = art?.id ?? null;
      }
    }

    if (!articleId) continue;

    await supabase.from('order_items').insert({
      order_id: orderId,
      product_article_id: articleId,
      quantity_ordered: item.quantity || 1,
      unit_price: parseFloat(item.price || '0') || 0,
      article_unit_quantity: 1,
    });
  }

  return NextResponse.json({ ok: true, action: 'created', order_id: orderId });
}
