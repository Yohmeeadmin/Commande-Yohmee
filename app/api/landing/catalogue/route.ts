import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// GET /api/landing/catalogue — public, no auth
export async function GET() {
  const supabase = getSupabaseAdmin();

  const [{ data: refs }, { data: settingsData }] = await Promise.all([
    supabase
      .from('product_references')
      .select(`
        id, name, description_publique, photo_url, atelier, base_unit_price, vat_rate, is_active, show_on_landing,
        articles:product_articles(id, display_name, quantity, prix_particulier, prix_pro, custom_price)
      `)
      .order('name'),
    supabase
      .from('app_settings')
      .select('landing_title, landing_subtitle, logo_url, company_name, company_tagline')
      .eq('id', 1)
      .single(),
  ]);

  // Group by atelier — filter show_on_landing + is_active in JS to avoid PostgREST ambiguity
  const atelierMap = new Map<string, { name: string; products: any[] }>();


  for (const ref of (refs ?? []) as any[]) {
    if (!ref.show_on_landing || !ref.is_active) continue;

    const key = (ref.atelier as string) ?? 'Autre';
    if (!atelierMap.has(key)) atelierMap.set(key, { name: key, products: [] });

    const articles = ((ref.articles ?? []) as any[]).map((a: any) => ({
      id: a.id,
      display_name: a.display_name,
      quantity: a.quantity,
      unit: null,
      prix_particulier: a.prix_particulier,
      prix_pro: a.prix_pro,
      custom_price: a.custom_price,
      price: a.prix_pro ?? a.prix_particulier ?? a.custom_price ?? (ref.base_unit_price * a.quantity),
    }));

    atelierMap.get(key)!.products.push({
      id: ref.id,
      name: ref.name,
      description_publique: ref.description_publique,
      photo_url: ref.photo_url,
      atelier: ref.atelier,
      base_unit_price: ref.base_unit_price,
      vat_rate: ref.vat_rate,
      articles,
    });
  }

  const settings = settingsData ?? {};
  const response = NextResponse.json({
    ateliers: Array.from(atelierMap.values()),
    settings: {
      landing_title: (settings as any).landing_title ?? (settings as any).company_name ?? 'BDK',
      landing_subtitle: (settings as any).landing_subtitle ?? (settings as any).company_tagline ?? null,
      logo_url: (settings as any).logo_url ?? null,
    },
  });

  // Prevent browser caching
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
