import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { buildRecipeSheet, RecipeSheetXL } from '@/lib/excel/recette-sheet';

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) return NextResponse.json({ error: 'ids required' }, { status: 400 });

  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: 'ids required' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const [{ data: recData }, { data: srData }, { data: settings }] = await Promise.all([
    supabase.from('recipe_sheets')
      .select(`id, nom, rendement, perte_pct, atelier, categorie, product_reference_id,
        product_reference:product_references(id, name, base_unit_price,
          articles:product_articles(prix_pro, prix_particulier, custom_price, quantity)),
        ingredients:recipe_ingredients!recipe_sheet_id(
          id, quantite, stock_item_id, sous_recipe_id,
          stock_item:stock_items(id, nom, unite, poids_unitaire_g, prix_moyen_pondere))`)
      .in('id', ids),
    supabase.from('recipe_sheets')
      .select(`id, nom, rendement, perte_pct, atelier, categorie, product_reference_id,
        ingredients:recipe_ingredients!recipe_sheet_id(
          id, quantite, stock_item_id, sous_recipe_id,
          stock_item:stock_items(id, nom, unite, poids_unitaire_g, prix_moyen_pondere))`)
      .eq('type', 'sous_recette'),
    supabase.from('app_settings').select('logo_url, company_name, company_tagline').eq('id', 1).single(),
  ]);

  if (!recData || recData.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const allSR = ((srData as unknown) as RecipeSheetXL[]) || [];
  const recipes = ((recData as unknown) as RecipeSheetXL[]).map(recipe => ({
    ...recipe,
    ingredients: (recipe.ingredients || []).map(ing => ({
      ...ing,
      sous_recipe: ing.sous_recipe_id ? allSR.find(s => s.id === ing.sous_recipe_id) ?? null : null,
    })),
  }));

  // Pré-fetch logo une seule fois pour toutes les feuilles
  const logoUrl = settings?.logo_url;
  const logoBuffer = logoUrl
    ? await fetch(logoUrl).then(r => r.arrayBuffer()).catch(() => null) ?? undefined
    : undefined;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'BDK';
  wb.created = new Date();

  // Conserver l'ordre de sélection demandé
  const ordered = ids.map(id => recipes.find(r => r.id === id)).filter(Boolean) as RecipeSheetXL[];

  for (const recipe of ordered) {
    await buildRecipeSheet(wb, recipe, allSR, recipe.rendement || 1, settings ?? {}, logoBuffer);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const annee = new Date().getFullYear();
  const filename = `BDK_Recettes_${annee}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
