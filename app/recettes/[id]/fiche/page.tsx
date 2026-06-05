'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer, ChefHat, AlertTriangle, ListOrdered, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/client';

// ─── Conversions ──────────────────────────────────────────────────────────────

const GRAM_FACTORS: Record<string, number> = {
  kg: 1000, g: 1, mg: 0.001,
  l: 1000, litre: 1000, litres: 1000, cl: 10, ml: 1,
};

function toGrams(qty: number, unite: string, poidsUnitaireG?: number | null): number {
  const key = unite.toLowerCase().trim();
  const factor = GRAM_FACTORS[key];
  if (factor) return qty * factor;
  if (poidsUnitaireG) return qty * poidsUnitaireG;
  return 0;
}

function fmtG(g: number): string {
  if (g <= 0) return '—';
  if (g >= 1000) return (g / 1000).toFixed(2).replace(/\.?0+$/, '') + ' kg';
  if (g % 1 === 0) return g + ' g';
  return g.toFixed(1) + ' g';
}

function formatQte(qty: number, unite: string, poidsUnitaireG?: number | null): string {
  const g = toGrams(qty, unite, poidsUnitaireG);
  if (g > 0) return fmtG(g);
  const rounded = Math.round(qty * 1000) / 1000;
  return `${rounded} ${unite}`;
}

// Parse "## Étape 1\nTexte\n## Étape 2\nTexte" into steps
function parseProcede(text: string | null): Array<{ titre: string; corps: string }> {
  if (!text?.trim()) return [];
  const parts = text.split(/(?=##)/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return [{ titre: '', corps: text.trim() }];
  return parts.map(p => {
    const lines = p.split('\n');
    const titre = lines[0].replace(/^##\s*/, '').trim();
    const corps = lines.slice(1).join('\n').trim();
    return { titre, corps };
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockItem { id: string; nom: string; unite: string; poids_unitaire_g: number | null; prix_moyen_pondere: number; }

interface IngredientLine {
  id: string; quantite: number;
  stock_item_id: string | null; sous_recipe_id: string | null;
  stock_item: StockItem | null;
  sous_recipe: RecipeSheet | null;
}

interface ProductReference {
  id: string; name: string; base_unit_price: number;
  articles?: { prix_pro: number | null; prix_particulier: number | null; custom_price: number | null; quantity: number }[];
}

interface RecipeSheet {
  id: string; nom: string; type: string;
  rendement: number; perte_pct: number;
  procede: string | null; atelier: string | null; categorie: string | null;
  allergenes: string[] | null; notes: string | null;
  photo_url?: string | null;
  product_reference_id?: string | null;
  product_reference?: ProductReference | null;
  ingredients: IngredientLine[];
}

// ─── Calculs coût (pour export) ──────────────────────────────────────────────

const GRAM_FACTORS_COST: Record<string, number> = {
  kg: 1000, g: 1, mg: 0.001,
  l: 1000, litre: 1000, litres: 1000, cl: 10, ml: 1,
};

function poidsKgIngredient(ing: IngredientLine): number {
  if (ing.stock_item) {
    const key = (ing.stock_item.unite || '').toLowerCase().trim();
    const factor = GRAM_FACTORS_COST[key];
    if (factor) return ing.quantite * factor / 1000;
    if (ing.stock_item.poids_unitaire_g) return ing.quantite * ing.stock_item.poids_unitaire_g / 1000;
    return 0;
  }
  if (ing.sous_recipe_id) return ing.quantite; // déjà en kg
  return 0;
}

function calcCoutSR(sr: RecipeSheet, allSR: RecipeSheet[]): number {
  return (sr.ingredients || []).reduce((s, ing) => {
    if (ing.stock_item) return s + ing.quantite * ing.stock_item.prix_moyen_pondere;
    if (ing.sous_recipe_id) {
      const nested = allSR.find(x => x.id === ing.sous_recipe_id);
      if (nested) return s + ing.quantite * calcCoutSRParKg(nested, allSR);
    }
    return s;
  }, 0) / (sr.rendement || 1);
}

function calcCoutSRParKg(sr: RecipeSheet, allSR: RecipeSheet[]): number {
  const cout = calcCoutSR(sr, allSR);
  const kgTotal = (sr.ingredients || []).reduce((s, i) => s + poidsKgIngredient(i), 0);
  const perte = (sr.perte_pct || 0) / 100;
  const kgFini = (kgTotal * (1 - perte)) / (sr.rendement || 1);
  return kgFini > 0 ? cout / kgFini : cout;
}

function getPrixVente(ref: ProductReference | null | undefined): number | null {
  if (!ref) return null;
  if (ref.base_unit_price > 0) return ref.base_unit_price;
  if (ref.articles?.length) {
    for (const a of [...ref.articles].sort((x, y) => x.quantity - y.quantity)) {
      const p = a.prix_pro ?? a.prix_particulier ?? a.custom_price;
      if (p && p > 0) return p / a.quantity;
    }
  }
  return null;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FicheRecettePage() {
  const { id } = useParams<{ id: string }>();
  const [recipe, setRecipe] = useState<RecipeSheet | null>(null);
  const [allSR, setAllSR] = useState<RecipeSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantite, setQuantite] = useState(1);

  useEffect(() => {
    async function load() {
      const [recRes, srRes] = await Promise.all([
        supabase.from('recipe_sheets')
          .select(`*, product_reference:product_references(id, name, base_unit_price, articles:product_articles(prix_pro, prix_particulier, custom_price, quantity)), ingredients:recipe_ingredients!recipe_sheet_id(
            id, quantite, stock_item_id, sous_recipe_id,
            stock_item:stock_items(id, nom, unite, poids_unitaire_g, prix_moyen_pondere)
          )`)
          .eq('id', id).single(),
        supabase.from('recipe_sheets')
          .select('id, nom, rendement, perte_pct, procede, allergenes, ingredients:recipe_ingredients!recipe_sheet_id(id, quantite, stock_item_id, sous_recipe_id, stock_item:stock_items(id, nom, unite, poids_unitaire_g, prix_moyen_pondere))')
          .eq('type', 'sous_recette'),
      ]);

      if (srRes.error) console.error('SR query error:', srRes.error);
      if (recRes.data) {
        const srRaw = (srRes.data as RecipeSheet[]) || [];
        setAllSR(srRaw);
        const rec = recRes.data as RecipeSheet;
        setRecipe({
          ...rec,
          ingredients: (rec.ingredients || []).map(ing => ({
            ...ing,
            sous_recipe: ing.sous_recipe_id ? srRaw.find(s => s.id === ing.sous_recipe_id) ?? null : null,
          })),
        });
        setQuantite(rec.rendement || 1);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function exportExcel() {
    if (!recipe) return;
    window.location.href = `/api/recettes/${id}/export-excel?quantite=${quantite}`;
  }

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
    </div>
  );

  if (!recipe) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-gray-400">
      <ChefHat size={40} className="text-gray-200" />
      <p>Recette introuvable</p>
      <Link href="/recettes" className="text-sm text-blue-600 hover:underline">Retour</Link>
    </div>
  );

  const facteur = quantite / (recipe.rendement || 1);

  // Poids total = somme de tous les ingrédients (MP directs + MP dans SR)
  let totalGrams = 0;
  for (const ing of recipe.ingredients) {
    if (ing.stock_item) {
      totalGrams += toGrams(ing.quantite * facteur, ing.stock_item.unite, ing.stock_item.poids_unitaire_g);
    } else if (ing.sous_recipe) {
      // quantite est en kg (poids output SR) → convertir en g
      totalGrams += ing.quantite * facteur * 1000;
    }
  }
  const parPortionG = quantite > 0 ? totalGrams / quantite : totalGrams;

  const srIngredients = recipe.ingredients.filter(ing => ing.sous_recipe_id && ing.sous_recipe);
  const mpIngredients = recipe.ingredients.filter(ing => !ing.sous_recipe_id && ing.stock_item);
  const montageSteps = parseProcede(recipe.procede);

  return (
    <>
      {/* ── Toolbar (masqué à l'impression) ── */}
      <div className="no-print mb-6 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/recettes" className="flex items-center gap-2 text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">Recettes</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
            <span className="text-sm text-gray-400">Quantité</span>
            <input
              type="number" min={1} value={quantite}
              onChange={e => setQuantite(parseInt(e.target.value) || 1)}
              onFocus={e => e.target.select()}
              className="w-14 text-lg font-black text-gray-900 text-center focus:outline-none"
            />
            <span className="text-sm text-gray-400">u.</span>
          </div>
          <Link href={`/recettes/${id}/etapes`}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
            <ListOrdered size={15} /> Étapes de prod
          </Link>
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800"
          >
            <Printer size={15} /> Imprimer
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-3 print:space-y-2">

        {/* ── 1. En-tête : photo + nom + composition ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 print:border-gray-200">
          <div className="flex items-start gap-5">
            {/* Photo */}
            {recipe.photo_url && (
              <div className="shrink-0 w-28 h-28 rounded-xl overflow-hidden bg-gray-50">
                <Image src={recipe.photo_url} alt={recipe.nom} width={112} height={112} className="w-full h-full object-cover" unoptimized />
              </div>
            )}

            {/* Nom + méta */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-black text-gray-900 leading-tight">{recipe.nom}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {recipe.atelier && <span className="text-sm text-gray-400">{recipe.atelier}</span>}
                {recipe.categorie && (
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-semibold">{recipe.categorie}</span>
                )}
                {recipe.perte_pct > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-500 rounded-full font-semibold">Perte {recipe.perte_pct}%</span>
                )}
              </div>
            </div>

            {/* Composition summary */}
            {recipe.ingredients.length > 0 && (
              <div className="shrink-0 border border-gray-100 rounded-xl p-3 min-w-[160px] hidden sm:block">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Composition</p>
                <div className="space-y-1.5">
                  {recipe.ingredients.map((ing, i) => {
                    const nom = ing.sous_recipe?.nom ?? ing.stock_item?.nom ?? '—';
                    let qteLabel = '';
                    if (ing.stock_item) {
                      qteLabel = formatQte(ing.quantite * facteur, ing.stock_item.unite, ing.stock_item.poids_unitaire_g);
                    } else if (ing.sous_recipe) {
                      qteLabel = fmtG(ing.quantite * facteur * 1000);
                    }
                    return (
                      <div key={i} className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-gray-600 truncate">{nom}</span>
                        <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0">{qteLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Barre stats ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden print:border-gray-200">
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            <div className="px-4 py-4">
              <p className="text-xs text-gray-400 mb-1">Poids total</p>
              <p className="text-xl font-black text-gray-900 leading-tight">{fmtG(totalGrams)}</p>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-gray-400 mb-1">Portions</p>
              <p className="text-xl font-black text-gray-900 leading-tight">{quantite}</p>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-gray-400 mb-1">Unité</p>
              <p className="text-xl font-black text-gray-900 leading-tight">portions</p>
            </div>
            <div className="px-4 py-4 bg-blue-600">
              <p className="text-xs text-blue-200 mb-1">Par portion</p>
              <p className="text-xl font-black text-white leading-tight">{fmtG(parPortionG)}</p>
            </div>
          </div>
        </div>

        {/* ── 3. MP directs (si la recette en a) ── */}
        {mpIngredients.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 print:border-gray-200">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Ingrédients</p>
            <div className="divide-y divide-gray-50">
              {mpIngredients.map((ing, i) => {
                const qteLabel = formatQte(ing.quantite * facteur, ing.stock_item!.unite, ing.stock_item!.poids_unitaire_g);
                return (
                  <div key={i} className="flex items-baseline justify-between py-2.5">
                    <span className="text-base font-semibold text-gray-800">{ing.stock_item!.nom}</span>
                    <span className="text-xl font-black text-gray-900 tabular-nums">{qteLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 4. Sous-recettes ── */}
        {srIngredients.map((ing, idx) => {
          const sr = ing.sous_recipe!;

          // kg produit par 1 batch du SR (ingrédients → output après perte)
          const kgInputParBatch = (sr.ingredients || []).reduce((s, srIng) => {
            if (!srIng.stock_item) return s;
            return s + toGrams(srIng.quantite, srIng.stock_item.unite, srIng.stock_item.poids_unitaire_g) / 1000;
          }, 0);
          const kgOutputParBatch = kgInputParBatch * (1 - (sr.perte_pct || 0) / 100) / (sr.rendement || 1);

          // Nombre de batches nécessaires pour obtenir ing.quantite kg d'output
          const srFacteur = kgOutputParBatch > 0
            ? (ing.quantite * facteur) / kgOutputParBatch
            : (ing.quantite * facteur) / (sr.rendement || 1);
          const steps = parseProcede(sr.procede);
          const hasIngredients = (sr.ingredients || []).some(i => i.stock_item);
          const hasSteps = steps.length > 0;

          return (
            <div key={idx} className="bg-white rounded-2xl border border-gray-100 overflow-hidden print:border-gray-200">
              {/* Header SR */}
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3 bg-gray-50/60">
                <span className="text-[10px] px-2 py-1 bg-indigo-100 text-indigo-600 rounded-lg font-black tracking-wider">S-R</span>
                <span className="text-lg font-black text-gray-900">{sr.nom}</span>
                {sr.perte_pct > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-500 rounded-full font-semibold ml-auto">Perte {sr.perte_pct}%</span>
                )}
              </div>

              {/* Corps 2 colonnes */}
              <div className={`grid divide-gray-100 ${hasIngredients && hasSteps ? 'grid-cols-1 sm:grid-cols-2 sm:divide-x' : 'grid-cols-1'}`}>
                {/* Ingrédients */}
                {hasIngredients && (
                  <div className="px-6 py-4">
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">Ingrédients</p>
                    <div className="divide-y divide-gray-50">
                      {(sr.ingredients || []).filter(i => i.stock_item).map((srIng, j) => {
                        const qteScaled = srIng.quantite * srFacteur;
                        const qteLabel = formatQte(qteScaled, srIng.stock_item!.unite, srIng.stock_item!.poids_unitaire_g);
                        return (
                          <div key={j} className="flex items-baseline justify-between gap-4 py-2">
                            <span className="text-sm text-gray-700">{srIng.stock_item!.nom}</span>
                            <span className="text-base font-bold text-gray-900 tabular-nums shrink-0">{qteLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Procédé */}
                {hasSteps && (
                  <div className="px-6 py-4 border-t sm:border-t-0 border-gray-50">
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">Procédé</p>
                    <div className="space-y-3">
                      {steps.map((step, k) => (
                        <div key={k}>
                          {step.titre && (
                            <p className="text-xs font-black text-gray-500 mb-0.5">{step.titre}</p>
                          )}
                          {step.corps && (
                            <p className="text-sm text-gray-600 leading-relaxed">{step.corps}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* ── 5. Montage (procédé principal) ── */}
        {montageSteps.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 print:border-gray-200">
            <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest mb-4">Montage</p>
            <div className="space-y-4">
              {montageSteps.map((step, i) => (
                <div key={i}>
                  {step.titre && (
                    <p className="text-sm font-black text-gray-700 mb-0.5">{step.titre}</p>
                  )}
                  {step.corps && (
                    <p className="text-sm text-gray-600 leading-relaxed">{step.corps}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 6. Allergènes ── */}
        {(recipe.allergenes || []).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 print:border-gray-200">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle size={13} className="text-yellow-500 shrink-0" />
              <span className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Allergènes</span>
              {recipe.allergenes!.map(a => (
                <span key={a} className="text-xs px-2.5 py-1 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-full font-semibold">{a}</span>
              ))}
            </div>
          </div>
        )}

        {/* Footer impression */}
        <div className="hidden print:flex px-1 py-3 text-xs text-gray-400 justify-between">
          <span>{recipe.nom} — {quantite} portion{quantite > 1 ? 's' : ''}</span>
          <span>{new Date().toLocaleDateString('fr-FR')}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          main { padding: 0 !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>
    </>
  );
}
