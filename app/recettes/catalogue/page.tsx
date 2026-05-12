'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Package, Search, AlertTriangle, CheckCircle2, Minus } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockItemLight { id: string; prix_moyen_pondere: number; unite: string; poids_unitaire_g: number | null; }

interface IngredientLine {
  stock_item_id?: string | null;
  sous_recipe_id?: string | null;
  quantite: number;
  stock_item?: StockItemLight | null;
  sous_recipe?: RecipeSheetLight | null;
}

interface RecipeSheetLight {
  id: string; nom: string; rendement: number; perte_pct: number;
  product_reference_id: string | null;
  ingredients?: IngredientLine[];
}

interface ProductArticle {
  id: string; display_name: string; quantity: number; pack_type: string;
  packaging_cost: number;
  prix_pro: number | null;
  prix_particulier: number | null;
  custom_price: number | null;
  product_reference: { id: string; name: string; base_unit_price: number; atelier: string } | null;
}

// ─── Calculs (identiques à la page recettes) ─────────────────────────────────

const GRAM_FACTORS: Record<string, number> = {
  kg: 1000, g: 1, mg: 0.001,
  l: 1000, litre: 1000, litres: 1000, cl: 10, ml: 1,
};

function calcPoidsKg(lignes: IngredientLine[], allSR: RecipeSheetLight[]): number {
  return lignes.reduce((sum, l) => {
    if (l.stock_item_id && l.stock_item) {
      const key = (l.stock_item.unite || '').toLowerCase().trim();
      const factor = GRAM_FACTORS[key];
      if (factor) return sum + l.quantite * factor / 1000;
      if (l.stock_item.poids_unitaire_g) return sum + l.quantite * l.stock_item.poids_unitaire_g / 1000;
    }
    if (l.sous_recipe_id) {
      // l.quantite est en kg (poids de SR utilisé) — on l'utilise directement
      // que sous_recipe soit chargé ou non
      return sum + l.quantite;
    }
    return sum;
  }, 0);
}

function calcSousRecette(sr: RecipeSheetLight, allSR: RecipeSheetLight[]): number {
  const coutBrut = (sr.ingredients || []).reduce((s, ing) => {
    if (ing.stock_item_id && ing.stock_item) return s + ing.quantite * ing.stock_item.prix_moyen_pondere;
    if (ing.sous_recipe_id) {
      const nested = allSR.find(x => x.id === ing.sous_recipe_id);
      if (nested) return s + ing.quantite * calcSousRecetteParKg(nested, allSR);
    }
    return s;
  }, 0);
  // Perte = réduit le poids output, pas le coût
  return coutBrut / (sr.rendement || 1);
}

function calcSousRecetteParKg(sr: RecipeSheetLight, allSR: RecipeSheetLight[]): number {
  const costPerUnit = calcSousRecette(sr, allSR);
  const kgTotal = calcPoidsKg(sr.ingredients || [], allSR);
  const perte = (sr.perte_pct || 0) / 100;
  const kgFiniPerUnit = (kgTotal * (1 - perte)) / (sr.rendement || 1);
  return kgFiniPerUnit > 0 ? costPerUnit / kgFiniPerUnit : costPerUnit;
}

function calcCoutUnitaire(recipe: RecipeSheetLight, allSR: RecipeSheetLight[]): number {
  const coutBrut = (recipe.ingredients || []).reduce((s, ing) => {
    if (ing.stock_item_id && ing.stock_item) return s + ing.quantite * ing.stock_item.prix_moyen_pondere;
    if (ing.sous_recipe_id && ing.sous_recipe) return s + ing.quantite * calcSousRecetteParKg(ing.sous_recipe, allSR);
    return s;
  }, 0);
  const coutAvecPerte = coutBrut / Math.max(0.01, 1 - (recipe.perte_pct || 0) / 100);
  return coutAvecPerte / (recipe.rendement || 1);
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function margeColor(pct: number | null) {
  if (pct === null) return 'text-gray-400';
  if (pct >= 60) return 'text-green-700';
  if (pct >= 30) return 'text-blue-700';
  if (pct >= 10) return 'text-orange-600';
  return 'text-red-600';
}

function margeBg(pct: number | null) {
  if (pct === null) return 'bg-gray-100 text-gray-500';
  if (pct >= 60) return 'bg-green-100 text-green-700';
  if (pct >= 30) return 'bg-blue-100 text-blue-700';
  if (pct >= 10) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CatalogueCoutePage() {
  const [articles, setArticles] = useState<ProductArticle[]>([]);
  const [recipes, setRecipes] = useState<RecipeSheetLight[]>([]);
  const [sousRecettes, setSousRecettes] = useState<RecipeSheetLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAtelier, setFilterAtelier] = useState('');
  const [filterMarge, setFilterMarge] = useState<'all' | 'alerte' | 'bonne' | 'sans_recette'>('all');
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [editingPkgVal, setEditingPkgVal] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [artRes, recRes, srRes] = await Promise.all([
      supabase.from('product_articles')
        .select('id, display_name, quantity, pack_type, packaging_cost, prix_pro, prix_particulier, custom_price, product_reference:product_references(id, name, base_unit_price, atelier)')
        .eq('is_active', true)
        .order('display_name'),
      supabase.from('recipe_sheets')
        .select(`id, nom, rendement, perte_pct, product_reference_id,
          ingredients:recipe_ingredients!recipe_sheet_id(
            *, stock_item:stock_items(id, prix_moyen_pondere, unite, poids_unitaire_g)
          )`)
        .eq('type', 'recette'),
      supabase.from('recipe_sheets')
        .select(`id, nom, rendement, perte_pct,
          ingredients:recipe_ingredients!recipe_sheet_id(
            *, stock_item:stock_items(id, prix_moyen_pondere, unite, poids_unitaire_g)
          )`)
        .eq('type', 'sous_recette'),
    ]);

    const srRaw = (srRes.data as RecipeSheetLight[]) || [];
    const recRaw = (recRes.data as RecipeSheetLight[]) || [];

    // Peupler sous_recipe dans les ingrédients depuis les SR chargées
    const srWithNested = srRaw.map(sr => ({
      ...sr,
      ingredients: (sr.ingredients || []).map(ing => ({
        ...ing,
        sous_recipe: ing.sous_recipe_id ? srRaw.find(s => s.id === ing.sous_recipe_id) || null : null,
      })),
    }));
    const recWithNested = recRaw.map(r => ({
      ...r,
      ingredients: (r.ingredients || []).map(ing => ({
        ...ing,
        sous_recipe: ing.sous_recipe_id ? srWithNested.find(s => s.id === ing.sous_recipe_id) || null : null,
      })),
    }));

    setArticles((artRes.data as ProductArticle[]) || []);
    setRecipes(recWithNested);
    setSousRecettes(srWithNested);
    setLoading(false);
  }

  async function savePackaging(id: string, val: number) {
    try {
      const { error } = await supabase.from('product_articles').update({ packaging_cost: val }).eq('id', id);
      if (error) throw error;
      setArticles(p => p.map(a => a.id === id ? { ...a, packaging_cost: val } : a));
    } catch (err: any) {
      alert('Erreur lors de la sauvegarde : ' + (err?.message || String(err)));
    } finally {
      setEditingPkgId(null);
    }
  }

// Enrichir chaque article avec son coût recette
  const enriched = useMemo(() => {
    return articles.map(art => {
      const refId = art.product_reference?.id;
      const recipe = refId ? recipes.find(r => r.product_reference_id === refId) : null;
      const coutUnitaire = recipe ? calcCoutUnitaire(recipe, sousRecettes) : null;
      const coutRecetteLot = coutUnitaire !== null ? coutUnitaire * art.quantity : null;
      const pkgCost = art.packaging_cost || 0;
      const coutTotalLot = coutRecetteLot !== null ? coutRecetteLot + pkgCost : null;
      const baseCalc = art.product_reference && art.product_reference.base_unit_price > 0 ? art.product_reference.base_unit_price * art.quantity : null;
      const prixVente = art.prix_pro ?? art.prix_particulier ?? art.custom_price ?? baseCalc;
      const marge = coutTotalLot !== null && prixVente !== null ? prixVente - coutTotalLot : null;
      const tauxMarge = marge !== null && prixVente && prixVente > 0 ? (marge / prixVente) * 100 : null;
      return { ...art, recipe, coutUnitaire, coutRecetteLot, coutTotalLot, prixVente, marge, tauxMarge };
    });
  }, [articles, recipes, sousRecettes]);

  const ateliers = useMemo(() => {
    const set = new Set(enriched.map(a => a.product_reference?.atelier).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [enriched]);

  const displayed = useMemo(() => enriched.filter(a => {
    const matchSearch = a.display_name.toLowerCase().includes(search.toLowerCase())
      || (a.product_reference?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchAtelier = !filterAtelier || a.product_reference?.atelier === filterAtelier;
    const matchMarge = filterMarge === 'all' ? true
      : filterMarge === 'sans_recette' ? !a.recipe
      : filterMarge === 'alerte' ? (a.tauxMarge === null || a.tauxMarge < 30)
      : a.tauxMarge !== null && a.tauxMarge >= 30;
    return matchSearch && matchAtelier && matchMarge;
  }), [enriched, search, filterAtelier, filterMarge]);

  const stats = useMemo(() => {
    const avecRecette = enriched.filter(a => a.recipe);
    const alertes = avecRecette.filter(a => a.tauxMarge !== null && a.tauxMarge < 30);
    const avgMarge = avecRecette.length > 0
      ? avecRecette.reduce((s, a) => s + (a.tauxMarge ?? 0), 0) / avecRecette.length
      : 0;
    return {
      total: enriched.length,
      avecRecette: avecRecette.length,
      sansRecette: enriched.length - avecRecette.length,
      alertes: alertes.length,
      avgMarge: Math.round(avgMarge),
    };
  }, [enriched]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/recettes" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Catalogue coûté</h1>
            <p className="text-sm text-gray-400">Articles valorisés depuis les fiches recettes</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-gray-900">{stats.avecRecette}<span className="text-sm font-normal text-gray-400">/{stats.total}</span></p>
          <p className="text-xs text-gray-400 mt-0.5">Articles valorisés</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-green-600">{stats.avgMarge}%</p>
          <p className="text-xs text-gray-400 mt-0.5">Marge moy.</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stats.alertes > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-black ${stats.alertes > 0 ? 'text-red-600' : 'text-gray-400'}`}>{stats.alertes}</p>
          <p className="text-xs text-gray-400 mt-0.5">En alerte marge</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${stats.sansRecette > 0 ? 'bg-orange-50 border-orange-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-black ${stats.sansRecette > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{stats.sansRecette}</p>
          <p className="text-xs text-gray-400 mt-0.5">Sans recette</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        {ateliers.length > 0 && (
          <select value={filterAtelier} onChange={e => setFilterAtelier(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tous les ateliers</option>
            {ateliers.map(a => <option key={a}>{a}</option>)}
          </select>
        )}
        {([
          { v: 'all', l: 'Tous' },
          { v: 'sans_recette', l: `Sans recette (${stats.sansRecette})` },
          { v: 'alerte', l: `Alerte (${stats.alertes})` },
          { v: 'bonne', l: 'Bonne marge' },
        ] as const).map(f => (
          <button key={f.v} onClick={() => setFilterMarge(f.v)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${filterMarge === f.v ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 font-semibold uppercase tracking-wide bg-gray-50">
                <th className="text-left px-4 py-3">Article</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Format</th>
                <th className="text-right px-4 py-3">Coût recette</th>
                <th className="text-right px-4 py-3">Packaging</th>
                <th className="text-right px-4 py-3">Coût total</th>
                <th className="text-right px-4 py-3">Prix vente</th>
                <th className="text-right px-4 py-3">Marge</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Package className="mx-auto mb-2 text-gray-200" size={32} />
                    Aucun article
                  </td>
                </tr>
              ) : displayed.map(art => {
                const isEditing = editingPkgId === art.id;
                return (
                  <tr key={art.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    {/* Article */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{art.display_name}</p>
                        <p className="text-xs text-gray-400">{art.product_reference?.name}</p>
                      </div>
                    </td>

                    {/* Format */}
                    <td className="px-4 py-3 text-right text-gray-400 text-xs hidden sm:table-cell">
                      ×{art.quantity}
                    </td>

                    {/* Coût recette */}
                    <td className="px-4 py-3 text-right">
                      {art.coutRecetteLot !== null ? (
                        <span className="font-medium text-gray-700">{art.coutRecetteLot.toFixed(2)}</span>
                      ) : (
                        <span className="text-xs text-orange-500 font-medium flex items-center justify-end gap-1">
                          <AlertTriangle size={11} /> Pas de recette
                        </span>
                      )}
                    </td>

                    {/* Packaging — inline edit */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number" min={0} step={0.01}
                          value={editingPkgVal}
                          onChange={e => setEditingPkgVal(e.target.value)}
                          onBlur={() => savePackaging(art.id, parseFloat(editingPkgVal) || 0)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') savePackaging(art.id, parseFloat(editingPkgVal) || 0);
                            if (e.key === 'Escape') setEditingPkgId(null);
                          }}
                          autoFocus
                          className="w-20 px-2 py-1 border border-blue-400 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingPkgId(art.id); setEditingPkgVal(String(art.packaging_cost || 0)); }}
                          className="text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors tabular-nums"
                        >
                          {(art.packaging_cost || 0).toFixed(2)}
                        </button>
                      )}
                    </td>

                    {/* Coût total */}
                    <td className="px-4 py-3 text-right">
                      {art.coutTotalLot !== null ? (
                        <span className="font-bold text-gray-900">{art.coutTotalLot.toFixed(2)}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Prix vente */}
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                      {art.prixVente !== null && art.prixVente > 0 ? art.prixVente.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Marge */}
                    <td className="px-4 py-3 text-right">
                      {art.tauxMarge !== null ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${margeBg(art.tauxMarge)}`}>
                          {art.tauxMarge >= 30
                            ? <CheckCircle2 size={10} />
                            : <AlertTriangle size={10} />}
                          {art.tauxMarge.toFixed(0)}%
                        </span>
                      ) : art.recipe ? (
                        <span className="text-xs text-gray-400">Sans prix</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          </div>
          {/* Footer */}
          {displayed.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 text-xs text-gray-400 flex justify-between">
              <span>{displayed.length} article{displayed.length > 1 ? 's' : ''} · Cliquez sur le packaging pour l'éditer · Prix vente depuis le catalogue</span>
              <span>Valeurs en MAD</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
