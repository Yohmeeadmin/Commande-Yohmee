import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ─── Helpers WooCommerce API ───────────────────────────────────────────────────

function wcHeaders(key: string, secret: string) {
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
  return { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' };
}

async function wcGet(baseUrl: string, key: string, secret: string, endpoint: string, page = 1) {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/${endpoint}?per_page=100&page=${page}`;
  const res = await fetch(url, { headers: wcHeaders(key, secret) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce ${endpoint} — ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function wcGetAll(baseUrl: string, key: string, secret: string, endpoint: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const data = await wcGet(baseUrl, key, secret, endpoint, page);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

function generateCode(name: string, prefix: string): string {
  const slug = name.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return `${prefix}-${slug}`;
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, '').trim() || null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { company_id, sync_type = 'all', woocommerce_url: bodyUrl, woocommerce_key: bodyKey, woocommerce_secret: bodySecret } = await req.json();
  const supabase = getSupabaseAdmin();

  // Récupérer l'entreprise
  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('*')
    .eq('id', company_id)
    .single();

  if (companyErr || !company) {
    return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });
  }

  // Credentials : priorité au body (formulaire pas encore sauvegardé), sinon DB
  const wcUrl = bodyUrl || company.woocommerce_url;
  const wcKey = bodyKey || company.woocommerce_key;
  const wcSecret = bodySecret || company.woocommerce_secret;
  const companySlug = company.slug;

  if (!wcUrl || !wcKey || !wcSecret) {
    return NextResponse.json({ error: 'Credentials WooCommerce manquants — renseignez et sauvegardez l\'URL, la Consumer Key et le Consumer Secret' }, { status: 400 });
  }

  const results = {
    categories: 0,
    products: 0,
    articles: 0,
    customers: 0,
    skipped: 0,
    errors: [] as string[],
  };

  // ── 1. Catégories ────────────────────────────────────────────────────────────
  if (sync_type === 'all' || sync_type === 'products') {
    try {
      const wcCats = await wcGetAll(wcUrl, wcKey, wcSecret, 'products/categories');

      for (const wcat of wcCats) {
        if (!wcat.name || wcat.name.toLowerCase() === 'uncategorized' || wcat.name.toLowerCase() === 'non classé') continue;

        const { data: existing } = await supabase
          .from('categories')
          .select('id')
          .eq('company_id', company_id)
          .eq('nom', wcat.name)
          .maybeSingle();

        if (!existing) {
          const { data: maxRow } = await supabase
            .from('categories')
            .select('ordre')
            .eq('company_id', company_id)
            .order('ordre', { ascending: false })
            .limit(1)
            .maybeSingle();

          const { error } = await supabase.from('categories').insert({
            nom: wcat.name,
            company_id,
            atelier: 'autre',
            ordre: ((maxRow as any)?.ordre ?? 0) + 1,
          });
          if (error) results.errors.push(`Catégorie "${wcat.name}": ${error.message}`);
          else results.categories++;
        }
      }
    } catch (e: any) {
      results.errors.push(`Catégories: ${e.message}`);
    }
  }

  // ── 2. Produits ──────────────────────────────────────────────────────────────
  if (sync_type === 'all' || sync_type === 'products') {
    // Charger les catégories DB pour correspondance
    const { data: dbCats } = await supabase
      .from('categories')
      .select('id, nom')
      .eq('company_id', company_id);

    try {
      const wcProducts = await wcGetAll(wcUrl, wcKey, wcSecret, 'products');

      for (const wp of wcProducts) {
        if (wp.status !== 'publish') { results.skipped++; continue; }

        const code = wp.sku || generateCode(wp.name, companySlug.slice(0, 3).toUpperCase());
        const wcCatName = wp.categories?.[0]?.name;
        const matchedCat = dbCats?.find(c => c.nom === wcCatName);
        const basePrice = parseFloat(wp.price || wp.regular_price || '0') || 0;

        const refPayload = {
          code,
          name: wp.name,
          company_id,
          category_id: matchedCat?.id ?? null,
          atelier: 'autre',
          base_unit: 'pièce',
          base_unit_price: wp.type === 'variable' ? 0 : basePrice,
          vat_rate: 20,
          description: stripHtml(wp.short_description),
          is_active: true,
          woocommerce_product_id: wp.id,
        };

        // Upsert par woocommerce_product_id
        let refId: string;
        const { data: existingRef } = await supabase
          .from('product_references')
          .select('id')
          .eq('woocommerce_product_id', wp.id)
          .maybeSingle();

        if (existingRef) {
          await supabase.from('product_references').update(refPayload).eq('id', existingRef.id);
          refId = existingRef.id;
        } else {
          const { data: newRef, error: refErr } = await supabase
            .from('product_references')
            .insert(refPayload)
            .select('id')
            .single();
          if (refErr || !newRef) {
            results.errors.push(`Produit "${wp.name}": ${refErr?.message}`);
            continue;
          }
          refId = newRef.id;
          results.products++;
        }

        // ── Articles ───────────────────────────────────────────────────────────
        if (wp.type === 'variable') {
          try {
            const variations = await wcGetAll(wcUrl, wcKey, wcSecret, `products/${wp.id}/variations`);
            for (const v of variations) {
              const varPrice = parseFloat(v.price || v.regular_price || '0') || 0;
              const attrStr = v.attributes?.map((a: any) => a.option).join(' · ') || '';

              const { data: existingArt } = await supabase
                .from('product_articles')
                .select('id')
                .eq('woocommerce_variation_id', v.id)
                .maybeSingle();

              const artPayload = {
                product_reference_id: refId,
                pack_type: 'unite' as const,
                quantity: 1,
                product_state: 'frais' as const,
                prix_particulier: varPrice || null,
                is_active: true,
                woocommerce_variation_id: v.id,
              };

              if (existingArt) {
                await supabase.from('product_articles').update(artPayload).eq('id', existingArt.id);
              } else {
                const { error: artErr } = await supabase.from('product_articles').insert({
                  ...artPayload,
                  display_name: `${wp.name}${attrStr ? ` - ${attrStr}` : ''}`,
                });
                if (!artErr) results.articles++;
                else results.errors.push(`Variation "${wp.name} - ${attrStr}": ${artErr.message}`);
              }
            }
          } catch (e: any) {
            results.errors.push(`Variations "${wp.name}": ${e.message}`);
          }
        } else {
          // Produit simple → 1 article
          const { data: existingArt } = await supabase
            .from('product_articles')
            .select('id')
            .eq('product_reference_id', refId)
            .maybeSingle();

          if (!existingArt) {
            const { error: artErr } = await supabase.from('product_articles').insert({
              product_reference_id: refId,
              display_name: wp.name,
              pack_type: 'unite',
              quantity: 1,
              product_state: 'frais',
              prix_particulier: basePrice || null,
              is_active: true,
            });
            if (!artErr) results.articles++;
            else results.errors.push(`Article "${wp.name}": ${artErr.message}`);
          }
        }
      }
    } catch (e: any) {
      results.errors.push(`Produits: ${e.message}`);
    }
  }

  // ── 3. Clients ───────────────────────────────────────────────────────────────
  if (sync_type === 'all' || sync_type === 'customers') {
    try {
      const wcCustomers = await wcGetAll(wcUrl, wcKey, wcSecret, 'customers');

      for (const wc of wcCustomers) {
        if (!wc.email) continue;

        const nom = wc.billing?.company ||
          `${wc.first_name} ${wc.last_name}`.trim() ||
          wc.email;

        const ville = wc.shipping?.city || wc.billing?.city || null;
        const adresse = [wc.shipping?.address_1, wc.shipping?.address_2]
          .filter(Boolean).join(', ') || null;

        const clientPayload = {
          nom,
          email: wc.email,
          telephone: wc.billing?.phone || null,
          adresse_livraison: adresse,
          ville,
          is_active: true,
          woocommerce_customer_id: wc.id,
        };

        const { data: existingClient } = await supabase
          .from('clients')
          .select('id')
          .eq('woocommerce_customer_id', wc.id)
          .maybeSingle();

        if (existingClient) {
          await supabase.from('clients').update(clientPayload).eq('id', existingClient.id);
        } else {
          const { error } = await supabase.from('clients').insert(clientPayload);
          if (error) results.errors.push(`Client "${nom}": ${error.message}`);
          else results.customers++;
        }
      }
    } catch (e: any) {
      results.errors.push(`Clients: ${e.message}`);
    }
  }

  return NextResponse.json(results);
}
