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
    orders: 0,
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
          .eq('nom', wcat.name)
          .maybeSingle();

        if (!existing) {
          const { data: maxRow } = await supabase
            .from('categories')
            .select('ordre')
            .order('ordre', { ascending: false })
            .limit(1)
            .maybeSingle();

          const { error } = await supabase.from('categories').insert({
            nom: wcat.name,
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
      .select('id, nom');

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
            for (let idx = 0; idx < variations.length; idx++) {
              const v = variations[idx];
              const varPrice = parseFloat(v.price || v.regular_price || '0') || 0;
              const attrStr = v.attributes?.map((a: any) => a.option).join(' · ') || '';

              // Parse the largest number from attribute strings (e.g. "6/8 personnes" → 8)
              // Fall back to variation index+1 to keep the unique (ref, pack_type, qty, state) constraint satisfied
              const nums = attrStr.match(/\d+/g)?.map(Number) ?? [];
              const quantity = nums.length > 0 ? Math.max(...nums) : idx + 1;

              const { data: existingArt } = await supabase
                .from('product_articles')
                .select('id')
                .eq('woocommerce_variation_id', v.id)
                .maybeSingle();

              const artPayload = {
                product_reference_id: refId,
                pack_type: 'unite' as const,
                quantity,
                product_state: 'frais' as const,
                custom_price: varPrice || null,
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
              custom_price: basePrice || null,
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

  // ── 3. Clients (depuis commandes WC, dédoublonnés par téléphone) ─────────────
  if (sync_type === 'all' || sync_type === 'customers') {
    try {
      const wcOrders = await wcGetAll(wcUrl, wcKey, wcSecret, 'orders');

      // Dédoublonner par téléphone (le plus récent gagne)
      const byPhone = new Map<string, any>();
      for (const order of wcOrders) {
        const phone = order.billing?.phone?.replace(/\s+/g, '') || null;
        if (!phone) continue;
        if (!byPhone.has(phone)) byPhone.set(phone, order);
      }

      for (const order of byPhone.values()) {
        const billing = order.billing;
        const phone = billing?.phone?.replace(/\s+/g, '') || null;
        if (!phone) continue;

        const nom = billing?.company ||
          `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim() ||
          billing?.email || phone;

        const ville = billing?.city || null;
        const adresse = [billing?.address_1, billing?.address_2]
          .filter(Boolean).join(', ') || null;

        const clientPayload = {
          nom,
          email: billing?.email || null,
          telephone: phone,
          adresse_livraison: adresse,
          ville,
          is_active: true,
          company_id,
        };

        const { data: existingClient } = await supabase
          .from('clients')
          .select('id')
          .eq('telephone', phone)
          .eq('company_id', company_id)
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

  // ── 4. Commandes historiques ──────────────────────────────────────────────────
  if (sync_type === 'all' || sync_type === 'orders') {
    try {
      const wcOrders = await wcGetAll(wcUrl, wcKey, wcSecret, 'orders');

      // Map statut WooCommerce → BDK
      const statusMap: Record<string, string> = {
        completed: 'livree',
        processing: 'confirmee',
        'on-hold': 'confirmee',
        pending: 'brouillon',
        cancelled: 'annulee',
        refunded: 'annulee',
        failed: 'annulee',
      };

      for (const wo of wcOrders) {
        // Ignorer si déjà importé
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('woocommerce_order_id', wo.id)
          .maybeSingle();
        if (existingOrder) {
          // Mettre à jour delivery_time et delivery_date si manquants
          const getMeta2 = (key: string) => (wo.meta_data ?? []).find((m: any) => m.key === key)?.value ?? null;
          const pt = getMeta2('_billing_pickup_date');
          const ptime = getMeta2('_billing_pickup_time');
          if (pt || ptime) {
            await supabase.from('orders').update({
              ...(pt ? { delivery_date: pt } : {}),
              ...(ptime ? { delivery_time: ptime } : {}),
            }).eq('id', existingOrder.id).is('delivery_time', null);
          }
          continue;
        }

        // Trouver le client par téléphone
        const phone = wo.billing?.phone?.replace(/\s+/g, '') || null;
        if (!phone) { results.skipped++; continue; }

        const { data: client } = await supabase
          .from('clients')
          .select('id')
          .eq('telephone', phone)
          .eq('company_id', company_id)
          .maybeSingle();

        if (!client) { results.skipped++; continue; }

        const getMeta = (key: string) => (wo.meta_data ?? []).find((m: any) => m.key === key)?.value ?? null;
        const pickupDate = getMeta('_billing_pickup_date');
        const pickupTime = getMeta('_billing_pickup_time');
        const quartier   = getMeta('quartier');
        const deliveryDate = pickupDate || (wo.date_completed || wo.date_created || '').slice(0, 10);
        const status = statusMap[wo.status] ?? 'confirmee';
        const noteParts: string[] = [];
        if (quartier)         noteParts.push(`Quartier : ${quartier}`);
        if (wo.customer_note) noteParts.push(wo.customer_note);
        const note = noteParts.join('\n') || null;

        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert({
            client_id: client.id,
            delivery_date: deliveryDate || new Date().toISOString().slice(0, 10),
            status,
            note,
            delivery_time: pickupTime || null,
            woocommerce_order_id: wo.id,
          })
          .select('id')
          .single();

        if (orderErr || !order) {
          results.errors.push(`Commande WC#${wo.id}: ${orderErr?.message}`);
          continue;
        }

        // Lignes de commande
        for (const item of (wo.line_items || [])) {
          // Chercher l'article par variation_id ou product_id
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

          const unitPrice = parseFloat(item.price || '0') || 0;
          await supabase.from('order_items').insert({
            order_id: order.id,
            product_article_id: articleId,
            quantity_ordered: item.quantity || 1,
            unit_price: unitPrice,
            article_unit_quantity: 1,
          });
        }

        results.orders++;
      }
    } catch (e: any) {
      results.errors.push(`Commandes: ${e.message}`);
    }
  }

  return NextResponse.json(results);
}
