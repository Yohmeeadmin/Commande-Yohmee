import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { buildRecipeSheet, RecipeSheetXL } from '@/lib/excel/recette-sheet';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quantiteParam = req.nextUrl.searchParams.get('quantite');
  const supabase = getSupabaseAdmin();

  const [{ data: recData }, { data: srData }, { data: settings }] = await Promise.all([
    supabase.from('recipe_sheets')
      .select(`id, nom, rendement, perte_pct, atelier, categorie, product_reference_id,
        product_reference:product_references(id, name, base_unit_price,
          articles:product_articles(prix_pro, prix_particulier, custom_price, quantity)),
        ingredients:recipe_ingredients!recipe_sheet_id(
          id, quantite, stock_item_id, sous_recipe_id,
          stock_item:stock_items(id, nom, unite, poids_unitaire_g, prix_moyen_pondere))`)
      .eq('id', id).single(),
    supabase.from('recipe_sheets')
      .select(`id, nom, rendement, perte_pct, atelier, categorie, product_reference_id,
        ingredients:recipe_ingredients!recipe_sheet_id(
          id, quantite, stock_item_id, sous_recipe_id,
          stock_item:stock_items(id, nom, unite, poids_unitaire_g, prix_moyen_pondere))`)
      .eq('type', 'sous_recette'),
    supabase.from('app_settings').select('logo_url, company_name, company_tagline').eq('id', 1).single(),
  ]);

  if (!recData) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const allSR = ((srData as unknown) as RecipeSheetXL[]) || [];
  const recipe = (recData as unknown) as RecipeSheetXL;
  recipe.ingredients = (recipe.ingredients || []).map(ing => ({
    ...ing,
    sous_recipe: ing.sous_recipe_id ? allSR.find(s => s.id === ing.sous_recipe_id) ?? null : null,
  }));

  const quantite = quantiteParam ? parseInt(quantiteParam) : recipe.rendement || 1;

  // Pré-fetch logo une seule fois
  const logoUrl = settings?.logo_url;
  const logoBuffer = logoUrl
    ? await fetch(logoUrl).then(r => r.arrayBuffer()).catch(() => null) ?? undefined
    : undefined;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'BDK';
  wb.created = new Date();

  await buildRecipeSheet(wb, recipe, allSR, quantite, settings ?? {}, logoBuffer);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const annee = new Date().getFullYear();
  const safeName = recipe.nom.replace(/[^a-zA-Z0-9\u00C0-\u017E\s_-]/g, '').replace(/\s+/g, '_');
  const filename = `BDK_Recette_${safeName}_${annee}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
