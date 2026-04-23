import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// GET /api/landing/catalogue
// Public — no auth required
// Returns product references where show_on_landing = true, grouped by atelier
export async function GET() {
  const supabase = getSupabaseAdmin();

  const [{ data: refs }, { data: settingsData }] = await Promise.all([
    supabase
      .from('product_references')
      .select('id, name, description_publique, photo_url, atelier')
      .eq('show_on_landing', true)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('app_settings')
      .select('landing_title, landing_subtitle, logo_url, company_name, company_tagline')
      .eq('id', 1)
      .single(),
  ]);

  // Group by atelier, preserve insertion order of ateliers
  type RefItem = { id: string; name: string; description_publique: string | null; photo_url: string | null; atelier: string };
  const atelierMap = new Map<string, { name: string; products: RefItem[] }>();
  for (const ref of (refs ?? []) as RefItem[]) {
    const key = ref.atelier;
    if (!atelierMap.has(key)) {
      atelierMap.set(key, { name: key, products: [] });
    }
    atelierMap.get(key)!.products.push(ref);
  }

  const settings = settingsData ?? {};

  return NextResponse.json({
    ateliers: Array.from(atelierMap.values()),
    settings: {
      landing_title: (settings as any).landing_title ?? (settings as any).company_name ?? 'BDK',
      landing_subtitle: (settings as any).landing_subtitle ?? (settings as any).company_tagline ?? null,
      logo_url: (settings as any).logo_url ?? null,
    },
  });
}
