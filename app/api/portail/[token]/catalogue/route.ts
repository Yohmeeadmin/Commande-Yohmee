import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// GET /api/portail/[token]/catalogue
// Retourne articles (filtrés exclusifs), catégories, créneaux
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = getSupabaseAdmin();

  // Valide le token
  const { data: client } = await supabase
    .from('clients')
    .select('id, type_client, portal_active')
    .eq('portal_token', params.token)
    .single();

  if (!client?.portal_active) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const [{ data: articles }, { data: categories }, { data: slots }, { data: clientPrices }] = await Promise.all([
    supabase
      .from('product_articles')
      .select(`
        id, display_name, quantity, unit, prix_particulier, prix_pro, custom_price, is_active,
        portal_client_ids,
        product_reference:product_references(
          id, name, base_unit_price, vat_rate,
          category:categories(id, name)
        )
      `)
      .eq('is_active', true)
      .order('display_name'),
    supabase.from('categories').select('id, name').order('name'),
    supabase.from('delivery_slots').select('id, name, start_time, end_time, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('client_prices').select('product_article_id, prix_special').eq('client_id', client.id),
  ]);

  // Filtre : articles publics OU assignés à ce client
  const clientIdStr = client.id;
  const filtered = (articles || []).filter((a: any) => {
    const exclusifs: string[] | null = a.portal_client_ids;
    if (!exclusifs || exclusifs.length === 0) return true; // public
    return exclusifs.includes(clientIdStr);
  });

  // Prix spéciaux client
  const priceMap: Record<string, number> = {};
  for (const cp of (clientPrices || [])) {
    priceMap[(cp as any).product_article_id] = (cp as any).prix_special;
  }

  return NextResponse.json({
    articles: filtered,
    categories: categories || [],
    slots: slots || [],
    clientType: client.type_client,
    clientPrices: priceMap,
  });
}
