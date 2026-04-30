import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// GET /api/portail/[token]/catalogue
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data: client } = await supabase
    .from('clients')
    .select('id, type_client, portal_active, company_id')
    .eq('portal_token', token)
    .single();

  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  // Articles filtrés par company_id si le client en a un
  let articlesQuery = supabase
    .from('product_articles')
    .select(`
      id, display_name, quantity, unit, prix_particulier, prix_pro, custom_price, is_active,
      portal_client_ids,
      product_reference:product_references(
        id, name, base_unit_price, vat_rate, company_id,
        category:categories(id, nom)
      )
    `)
    .neq('is_active', false)
    .order('display_name');

  const [{ data: articles }, { data: categories }, { data: slots }, { data: clientPrices }] = await Promise.all([
    articlesQuery,
    supabase.from('categories').select('id, nom').order('nom'),
    supabase.from('delivery_slots').select('id, name, start_time, end_time, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('client_prices').select('product_article_id, prix_special').eq('client_id', client.id),
  ]);

  const clientIdStr = client.id;

  // Filtrer par company_id : exclure seulement les articles d'une AUTRE entreprise
  // (si l'article n'a pas de company_id, il est visible par tous)
  const companyFiltered = (articles || []).filter((a: any) => {
    const articleCompanyId = a.product_reference?.company_id;
    if (articleCompanyId && client.company_id && articleCompanyId !== client.company_id) return false;
    return true;
  });

  // Filtrer les exclusifs
  const filtered = companyFiltered.filter((a: any) => {
    const exclusifs: string[] | null = a.portal_client_ids;
    if (!exclusifs || exclusifs.length === 0) return true;
    return exclusifs.includes(clientIdStr);
  });

  // Normaliser le champ category (nom → name pour le front)
  const normalized = filtered.map((a: any) => ({
    ...a,
    product_reference: a.product_reference ? {
      ...a.product_reference,
      category: a.product_reference.category
        ? { id: a.product_reference.category.id, name: a.product_reference.category.nom }
        : null,
    } : null,
  }));

  const priceMap: Record<string, number> = {};
  for (const cp of (clientPrices || [])) {
    priceMap[(cp as any).product_article_id] = (cp as any).prix_special;
  }

  // Normaliser les catégories (nom → name)
  const catsNormalized = (categories || []).map((c: any) => ({ id: c.id, name: c.nom }));

  return NextResponse.json({
    articles: normalized,
    categories: catsNormalized,
    slots: slots || [],
    clientType: client.type_client,
    clientPrices: priceMap,
  });
}
