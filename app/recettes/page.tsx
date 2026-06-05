'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChefHat, Search, X, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertTriangle, RotateCcw, LayoutList, Table2, BookOpen, FileText, ShoppingBag, Calculator, CalendarDays, Check, FileSpreadsheet } from 'lucide-react';
import { PACK_TYPES, PRODUCT_STATES, ProductState, generateArticleDisplayName } from '@/types';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAteliers } from '@/lib/useAteliers';
import QuickRecipeSheet from '@/components/recettes/QuickRecipeSheet';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockItemLight { id: string; nom: string; unite: string; prix_moyen_pondere: number; poids_unitaire_g?: number | null; }

interface Gabarit {
  id?: string;
  nom: string;
  poids_kg: number;
}

interface IngredientLine {
  id?: string;
  stock_item_id?: string | null;
  sous_recipe_id?: string | null;
  quantite: number;
  gabarit_nom?: string | null;
  gabarit_poids_kg?: number | null;
  stock_item?: StockItemLight | null;
  sous_recipe?: RecipeSheet | null;
}

interface ProductReferenceLight {
  id: string; name: string;
  base_unit_price: number;
  articles?: { quantity: number; prix_pro: number | null; prix_particulier: number | null; custom_price: number | null }[];
}

function getPrixVenteUnitaire(ref: ProductReferenceLight | null | undefined): number | null {
  if (!ref) return null;
  if (ref.base_unit_price > 0) return ref.base_unit_price;
  if (ref.articles && ref.articles.length > 0) {
    const sorted = [...ref.articles].sort((a, b) => a.quantity - b.quantity);
    for (const art of sorted) {
      const p = art.prix_pro ?? art.prix_particulier ?? art.custom_price;
      if (p && p > 0) return p / art.quantity;
    }
  }
  return null;
}

interface ProductArticleForRecipe {
  id: string; display_name: string;
  quantity: number; pack_type: string;
  product_state: string | null;
  prix_pro: number | null;
  prix_particulier: number | null;
  custom_price: number | null;
}

interface RecipeSheet {
  id: string; nom: string;
  type: 'recette' | 'sous_recette';
  rendement: number; perte_pct: number;
  procede: string | null; atelier: string | null; categorie: string | null;
  allergenes: string[] | null; poids_portion_g: number | null; notes: string | null;
  product_reference_id: string | null;
  prix_cible: number | null; unite: string | null;
  delai_fabrication_h: number | null;
  dlc_heures: number | null;
  stock_min: number | null;
  ingredients?: IngredientLine[];
  gabarits?: Gabarit[];
  product_reference?: ProductReferenceLight | null;
  etats_config?: EtatsConfig | null;
}

// ─── Types procédé / états ────────────────────────────────────────────────────

type EtapeOverride = { skip?: boolean; duree?: number | null };
type EtatConfig = { dlc_heures: number | null; overrides: Record<number, EtapeOverride> };
type EtatsConfig = Partial<Record<string, EtatConfig>>;

// ─── Constantes ──────────────────────────────────────────────────────────────

const GRAM_FACTORS: Record<string, number> = {
  kg: 1000, g: 1, mg: 0.001,
  l: 1000, litre: 1000, litres: 1000, cl: 10, ml: 1,
};

function calcPoidsKg(lignes: IngredientLine[], allSR: RecipeSheet[]): number {
  return lignes.reduce((sum, l) => {
    if (l.stock_item_id && l.stock_item) {
      const key = l.stock_item.unite.toLowerCase().trim();
      const factor = GRAM_FACTORS[key];
      if (factor) return sum + l.quantite * factor / 1000;
      if (l.stock_item.poids_unitaire_g) return sum + l.quantite * l.stock_item.poids_unitaire_g / 1000;
    }
    if (l.sous_recipe_id) {
      // Si gabarit : quantite = fonds, kg réels = fonds × poids_par_fond
      const kgPerUnit = (l.gabarit_nom && l.gabarit_poids_kg) ? l.gabarit_poids_kg : 1;
      return sum + l.quantite * kgPerUnit;
    }
    return sum;
  }, 0);
}

const ALLERGENES_EU = ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'];

const UNITES_PREDEFINIES = ['pièce', 'portion', 'madeleine', 'macaron', 'biscuit', 'boule', 'tranche', 'tarte', 'entremet', 'croissant', 'pain', 'financier', 'éclair', 'chou', 'tuile', 'sablé', 'brownie'];

// ─── Calculs ─────────────────────────────────────────────────────────────────

function calcSousRecette(sr: RecipeSheet, allSR: RecipeSheet[]): number {
  const coutBrut = (sr.ingredients || []).reduce((s, ing) => {
    if (ing.stock_item_id && ing.stock_item) return s + ing.quantite * ing.stock_item.prix_moyen_pondere;
    if (ing.sous_recipe_id) {
      const nested = allSR.find(x => x.id === ing.sous_recipe_id);
      if (nested) return s + ing.quantite * calcSousRecetteParKg(nested, allSR);
    }
    return s;
  }, 0);
  // La perte réduit le poids output, pas le coût : on a dépensé ce qu'on a dépensé.
  return coutBrut / (sr.rendement || 1);
}

function calcSousRecetteParKg(sr: RecipeSheet, allSR: RecipeSheet[]): number {
  const costPerUnit = calcSousRecette(sr, allSR);
  const kgTotal = calcPoidsKg(sr.ingredients || [], allSR);
  const perte = (sr.perte_pct || 0) / 100;
  const kgFiniPerUnit = (kgTotal * (1 - perte)) / (sr.rendement || 1);
  return kgFiniPerUnit > 0 ? costPerUnit / kgFiniPerUnit : costPerUnit;
}

function calcLignes(lignes: IngredientLine[], allSR: RecipeSheet[], pertePct: number, rendement: number, applyPerteToCost = true) {
  const coutBrut = lignes.reduce((s, l) => {
    if (l.stock_item_id && l.stock_item) return s + l.quantite * l.stock_item.prix_moyen_pondere;
    if (l.sous_recipe_id) {
      const sr = l.sous_recipe || allSR.find(x => x.id === l.sous_recipe_id);
      if (sr) {
        // Si gabarit : quantite = fonds, kg réels = fonds × poids_par_fond
        const kgPerUnit = (l.gabarit_nom && l.gabarit_poids_kg) ? l.gabarit_poids_kg : 1;
        return s + l.quantite * kgPerUnit * calcSousRecetteParKg(sr, allSR);
      }
    }
    return s;
  }, 0);
  // Pour les sous-recettes : la perte réduit le poids output mais pas le coût (tu as payé ce que tu as payé).
  // Pour les recettes : la perte gonfle le coût/unité (si tu perds 20% de ta production, ça coûte plus cher par unité vendue).
  const coutAvecPerte = applyPerteToCost ? coutBrut / Math.max(0.01, 1 - pertePct / 100) : coutBrut;
  const coutUnitaire = coutAvecPerte / (rendement || 1);
  return { coutBrut, coutAvecPerte, coutUnitaire };
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

// ─── Calculateur de fournée — helpers ────────────────────────────────────────

interface FlatIngredient {
  stock_item_id: string;
  nom: string;
  unite: string;
  poids_unitaire_g: number | null;
  quantite: number;
  via?: string;
}

function flattenRecipeIngredients(recipe: RecipeSheet, allSR: RecipeSheet[], factor = 1): FlatIngredient[] {
  const items: FlatIngredient[] = [];

  function processSR(sr: RecipeSheet, kgNeeded: number, depth = 0) {
    const kgInput = calcPoidsKg(sr.ingredients || [], allSR);
    const kgOutput = kgInput * (1 - (sr.perte_pct || 0) / 100) / (sr.rendement || 1);
    const srFactor = kgOutput > 0 ? kgNeeded / kgOutput : kgNeeded;
    for (const ing of sr.ingredients || []) {
      if (ing.stock_item_id && ing.stock_item) {
        items.push({ stock_item_id: ing.stock_item_id, nom: ing.stock_item.nom, unite: ing.stock_item.unite, poids_unitaire_g: ing.stock_item.poids_unitaire_g ?? null, quantite: ing.quantite * srFactor, via: sr.nom });
      } else if (ing.sous_recipe_id && depth < 3) {
        const nested = ing.sous_recipe || allSR.find(s => s.id === ing.sous_recipe_id);
        if (nested) processSR(nested, ing.quantite * srFactor, depth + 1);
      }
    }
  }

  for (const ing of recipe.ingredients || []) {
    if (ing.stock_item_id && ing.stock_item) {
      items.push({ stock_item_id: ing.stock_item_id, nom: ing.stock_item.nom, unite: ing.stock_item.unite, poids_unitaire_g: ing.stock_item.poids_unitaire_g ?? null, quantite: ing.quantite * factor });
    } else if (ing.sous_recipe_id) {
      const sr = ing.sous_recipe || allSR.find(s => s.id === ing.sous_recipe_id);
      if (sr) processSR(sr, ing.quantite * factor);
    }
  }

  // Fusionner les doublons (même stock_item_id)
  const merged = new Map<string, FlatIngredient>();
  for (const item of items) {
    const existing = merged.get(item.stock_item_id);
    if (existing) {
      existing.quantite += item.quantite;
      if (item.via && existing.via !== item.via) existing.via = undefined;
    } else {
      merged.set(item.stock_item_id, { ...item });
    }
  }
  return Array.from(merged.values());
}

function formatIngQte(quantite: number, unite: string, poidsUnitaireG: number | null): { main: string; hint?: string } {
  const u = unite.toLowerCase().trim();
  let grams: number | null = null;

  if (u === 'kg') grams = quantite * 1000;
  else if (u === 'g') grams = quantite;
  else if (u === 'mg') grams = quantite / 1000;
  else if (u === 'l' || u === 'litre' || u === 'litres') {
    const ml = quantite * 1000;
    return { main: ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(ml)} mL` };
  } else if (u === 'cl') {
    const ml = quantite * 10;
    return { main: ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(ml)} mL` };
  } else if (u === 'ml') {
    return { main: quantite >= 1000 ? `${(quantite / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(quantite)} mL` };
  } else {
    return { main: `${Math.round(quantite * 100) / 100} ${unite}` };
  }

  // Unités poids
  let main: string;
  if (grams >= 1000) main = `${(grams / 1000).toFixed(3).replace(/\.?0+$/, '')} kg`;
  else if (grams < 1) main = `${(grams * 1000).toFixed(0)} mg`;
  else main = `${Math.round(grams)} g`;

  let hint: string | undefined;
  if (poidsUnitaireG && poidsUnitaireG > 0 && grams > 0) {
    const count = Math.round(grams / poidsUnitaireG);
    if (count >= 2) hint = `≈ ${count} pcs`;
  }
  return { main, hint };
}

// ─── Modal Ajouter au catalogue ──────────────────────────────────────────────

function AddToCatalogueModal({ recipe, coutUnitaire, ateliers, onClose, onSaved }: {
  recipe: RecipeSheet;
  coutUnitaire: number;
  ateliers: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [refName, setRefName] = useState(recipe.nom);
  const [atelier, setAtelier] = useState(recipe.atelier || '');
  const [saving, setSaving] = useState(false);
  const [articles, setArticles] = useState([{
    id: Date.now(),
    packType: 'unite' as string,
    quantity: 1,
    state: 'frais' as string,
    prix: coutUnitaire > 0 ? parseFloat((coutUnitaire / (1 - 0.65)).toFixed(2)) : 0,
  }]);

  function addArticle() {
    setArticles(a => [...a, { id: Date.now(), packType: 'unite', quantity: 1, state: 'frais', prix: 0 }]);
  }

  function updateArticle(id: number, field: string, val: any) {
    setArticles(a => a.map(art => art.id === id ? { ...art, [field]: val } : art));
  }

  function removeArticle(id: number) {
    setArticles(a => a.filter(art => art.id !== id));
  }

  async function handleSave() {
    if (!refName.trim() || articles.length === 0) return;
    setSaving(true);
    try {
      // 1. Générer un code unique depuis le nom
      const baseCode = refName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'REF';
      const { data: existing } = await supabase.from('product_references').select('code').like('code', `${baseCode}%`);
      const code = existing && existing.length > 0 ? `${baseCode}${existing.length + 1}` : baseCode;
      const companyId = localStorage.getItem('catalogue_company_id') || null;

      // 2. Créer la référence produit
      const { data: ref, error: refErr } = await supabase
        .from('product_references')
        .insert({ name: refName.trim(), code, atelier: atelier || null, is_active: true, base_unit_price: 0, company_id: companyId })
        .select('id').single();
      if (refErr) throw new Error('Référence: ' + refErr.message);

      // 2. Créer les articles
      const artPayload = articles.map(art => ({
        product_reference_id: ref.id,
        display_name: generateArticleDisplayName('', refName.trim(), art.packType as any, art.quantity, art.state as any),
        pack_type: art.packType,
        quantity: art.quantity,
        product_state: art.state,
        prix_pro: art.prix > 0 ? art.prix : null,
        is_active: true,
        packaging_cost: 0,
      }));
      const { error: artErr } = await supabase.from('product_articles').insert(artPayload);
      if (artErr) throw new Error('Articles: ' + artErr.message);

      // 3. Lier la recette
      const { error: linkErr } = await supabase.from('recipe_sheets')
        .update({ product_reference_id: ref.id }).eq('id', recipe.id);
      if (linkErr) throw new Error('Lien recette: ' + linkErr.message);

      await onSaved();
      onClose();
    } catch (err: any) {
      alert('Erreur : ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onMouseDown={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh]"
        onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-black text-gray-900">Ajouter au catalogue</p>
            <p className="text-xs text-gray-400 mt-0.5">{recipe.nom}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving || !refName.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-blue-700">
              {saving ? 'Création…' : 'Créer & lier'}
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Référence */}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Référence produit</p>
            <input value={refName} onChange={e => setRefName(e.target.value)}
              placeholder="Nom de la référence *"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={atelier} onChange={e => setAtelier(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Atelier</option>
              {ateliers.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {/* Articles */}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Formats d'articles</p>
            {articles.map(art => (
              <div key={art.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select value={art.packType} onChange={e => updateArticle(art.id, 'packType', e.target.value)}
                    className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                    {PACK_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <input type="number" min={1} value={art.quantity}
                    onChange={e => updateArticle(art.id, 'quantity', parseInt(e.target.value) || 1)}
                    placeholder="Qté"
                    className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                  <select value={art.state} onChange={e => updateArticle(art.id, 'state', e.target.value)}
                    className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                    {PRODUCT_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Prix</span>
                    <input type="number" min={0} step={0.01} value={art.prix}
                      onChange={e => updateArticle(art.id, 'prix', parseFloat(e.target.value) || 0)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">MAD</span>
                  </div>
                  {art.prix > 0 && coutUnitaire > 0 && art.quantity > 0 && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      ((art.prix - coutUnitaire * art.quantity) / art.prix) * 100 >= 60 ? 'bg-green-100 text-green-700' :
                      ((art.prix - coutUnitaire * art.quantity) / art.prix) * 100 >= 30 ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {(((art.prix - coutUnitaire * art.quantity) / art.prix) * 100).toFixed(0)}%
                    </span>
                  )}
                  {articles.length > 1 && (
                    <button onClick={() => removeArticle(art.id)} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 italic">
                  {generateArticleDisplayName('', refName || recipe.nom, art.packType as any, art.quantity, art.state as any)}
                </p>
              </div>
            ))}
            <button onClick={addArticle}
              className="w-full py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
              + Ajouter un format
            </button>
          </div>

          {coutUnitaire > 0 && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Coût de revient recette</p>
              <p className="text-sm font-bold text-gray-700">{coutUnitaire.toFixed(2)} MAD/u. · Prix suggéré 65% : {(coutUnitaire / 0.35).toFixed(2)} MAD</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MargeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500">Sans prix</span>;
  if (pct >= 60) return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">{pct.toFixed(0)}% · Excellente</span>;
  if (pct >= 30) return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">{pct.toFixed(0)}% · Bonne</span>;
  if (pct >= 10) return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">{pct.toFixed(0)}% · Faible</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">{pct.toFixed(0)}% · Critique</span>;
}

function margeColor(pct: number | null) {
  if (pct === null) return 'text-gray-600';
  if (pct >= 60) return 'text-green-700';
  if (pct >= 30) return 'text-blue-700';
  if (pct >= 10) return 'text-orange-700';
  return 'text-red-700';
}

// ─── Calculateur de fournée — Modal ──────────────────────────────────────────

function CalculateurModal({ recipe, sousRecettes, onClose }: {
  recipe: RecipeSheet;
  sousRecettes: RecipeSheet[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'pieces' | 'ingredient'>('pieces');
  const [targetPieces, setTargetPieces] = useState(recipe.rendement);
  const [selectedIngKey, setSelectedIngKey] = useState('');
  const [targetQty, setTargetQty] = useState('');

  const flatBase = useMemo(() => flattenRecipeIngredients(recipe, sousRecettes, 1), [recipe, sousRecettes]);

  useEffect(() => {
    if (flatBase.length > 0 && !selectedIngKey) setSelectedIngKey(flatBase[0].stock_item_id);
  }, [flatBase, selectedIngKey]);

  const selectedIng = flatBase.find(i => i.stock_item_id === selectedIngKey);

  const factor = useMemo(() => {
    if (mode === 'pieces') return targetPieces > 0 ? targetPieces / (recipe.rendement || 1) : 1;
    if (!selectedIng || !targetQty) return 1;
    const qty = parseFloat(targetQty.replace(',', '.'));
    if (!qty || qty <= 0 || selectedIng.quantite <= 0) return 1;
    return qty / selectedIng.quantite;
  }, [mode, targetPieces, recipe.rendement, selectedIng, targetQty]);

  const resultPieces = Math.round(factor * (recipe.rendement || 1));
  const scaledIngredients = useMemo(() => flattenRecipeIngredients(recipe, sousRecettes, factor), [recipe, sousRecettes, factor]);

  const totalKg = useMemo(() => scaledIngredients.reduce((sum, ing) => {
    const u = ing.unite.toLowerCase().trim();
    if (u === 'kg') return sum + ing.quantite;
    if (u === 'g') return sum + ing.quantite / 1000;
    if (u === 'l' || u === 'litre' || u === 'litres') return sum + ing.quantite;
    if (u === 'cl') return sum + ing.quantite / 100;
    if (u === 'ml') return sum + ing.quantite / 1000;
    if (ing.poids_unitaire_g) return sum + ing.quantite * ing.poids_unitaire_g / 1000;
    return sum;
  }, 0), [scaledIngredients]);

  const unite = recipe.unite || 'pièce';
  const factorDisplay = Math.round(factor * 1000) / 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onMouseDown={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh]"
        onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-black text-gray-900">Calculateur de fournée</p>
            <p className="text-xs text-gray-400 mt-0.5">{recipe.nom} · base {recipe.rendement} {unite}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
              Imprimer
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Toggle mode */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            <button onClick={() => setMode('pieces')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'pieces' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              Par nombre de pièces
            </button>
            <button onClick={() => setMode('ingredient')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'ingredient' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              Par ingrédient
            </button>
          </div>

          {/* Inputs */}
          {mode === 'pieces' ? (
            <div className="flex items-center gap-3">
              <input
                type="number" min={1} value={targetPieces}
                onChange={e => setTargetPieces(parseInt(e.target.value) || 1)}
                onFocus={e => e.target.select()}
                className="flex-1 px-4 py-3 border-2 border-blue-400 rounded-xl text-2xl font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
              />
              <span className="text-gray-600 font-semibold text-lg">{unite}{targetPieces > 1 ? 's' : ''}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <select value={selectedIngKey} onChange={e => { setSelectedIngKey(e.target.value); setTargetQty(''); }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {flatBase.map(ing => (
                  <option key={ing.stock_item_id} value={ing.stock_item_id}>
                    {ing.nom}{ing.via ? ` (via ${ing.via})` : ''}
                  </option>
                ))}
              </select>
              {selectedIng && (
                <div className="relative">
                  <input
                    type="number" min={0} step="any"
                    value={targetQty}
                    onChange={e => setTargetQty(e.target.value)}
                    onFocus={e => e.target.select()}
                    placeholder={`Base = ${Math.round(selectedIng.quantite * 10000) / 10000}`}
                    className="w-full px-4 py-3 pr-20 border-2 border-blue-400 rounded-xl text-xl font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base text-gray-500 font-semibold pointer-events-none">{selectedIng.unite}</span>
                </div>
              )}
            </div>
          )}

          {/* Résultat */}
          <div className="bg-blue-600 rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-blue-200 font-semibold mb-0.5">Vous obtiendrez</p>
              <p className="text-3xl font-black text-white leading-tight">
                {resultPieces}
                <span className="text-base font-semibold ml-1.5">{unite}{resultPieces > 1 ? 's' : ''}</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              {totalKg > 0 && (
                <>
                  <p className="text-xs text-blue-200 font-semibold mb-0.5">Poids total</p>
                  <p className="text-xl font-black text-white">
                    {totalKg >= 1 ? `${totalKg.toFixed(2)} kg` : `${Math.round(totalKg * 1000)} g`}
                  </p>
                </>
              )}
              <p className="text-xs text-blue-300 mt-1">× {factorDisplay}</p>
            </div>
          </div>

          {/* Liste ingrédients */}
          <div className="space-y-1">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider px-1">Ingrédients à préparer</p>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50">
              {scaledIngredients.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Aucun ingrédient trouvé</p>
              ) : scaledIngredients.map((ing, i) => {
                const { main, hint } = formatIngQte(ing.quantite, ing.unite, ing.poids_unitaire_g);
                return (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{ing.nom}</p>
                      {ing.via && <p className="text-xs text-gray-400">via {ing.via}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-base font-black text-gray-900 tabular-nums">{main}</p>
                      {hint && <p className="text-xs text-gray-400">{hint}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center ${highlight ? 'bg-blue-50' : 'bg-gray-50'}`}>
      <p className={`text-[11px] font-bold uppercase tracking-wide mb-0.5 ${highlight ? 'text-blue-500' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-base font-black leading-tight ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

// ─── Modal recette ────────────────────────────────────────────────────────────

function RecipeModal({ recipe, type, stockItems, sousRecettes, productReferences, ateliers, categories, onClose, onSaved }: {
  recipe: RecipeSheet | null;
  type: 'recette' | 'sous_recette';
  stockItems: StockItemLight[];
  sousRecettes: RecipeSheet[];
  productReferences: ProductReferenceLight[];
  ateliers: { value: string; label: string }[];
  categories: { nom: string; atelier: string; pour?: string | null }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = !!recipe;

  const emptyState = () => ({
    nom: '', atelier: '', categorie: '', rendement: 1, pertePct: 0,
    produitId: '', notes: '', procede: '', allergenes: [] as string[],
    poidsPortionG: 0, prixCible: 0, lignes: [] as IngredientLine[],
    unite: 'pièce' as string,
    delaiH: 0, dlcHeures: 0, stockMin: 0,
  });

  const [form, setForm] = useState(() => {
    if (!isEdit) return emptyState();
    // Auto-matcher la référence par nom si pas encore liée
    let produitId = recipe!.product_reference_id || '';
    if (!produitId) {
      const match = productReferences.find(r =>
        r.name.toLowerCase().trim() === recipe!.nom.toLowerCase().trim()
      );
      if (match) produitId = match.id;
    }
    return {
      nom: recipe!.nom, atelier: recipe!.atelier || '', categorie: recipe!.categorie || '',
      rendement: recipe!.rendement, pertePct: recipe!.perte_pct || 0,
      produitId, notes: recipe!.notes || '',
      procede: recipe!.procede || '', allergenes: recipe!.allergenes || [],
      poidsPortionG: recipe!.poids_portion_g || 0,
      prixCible: recipe!.prix_cible || 0,
      unite: recipe!.unite || 'pièce',
      delaiH: recipe!.delai_fabrication_h || 0,
      dlcHeures: recipe!.dlc_heures || 0,
      stockMin: recipe!.stock_min || 0,
      lignes: (recipe!.ingredients || []).map(ing => ({ ...ing })),
    };
  });

  const [step, setStep] = useState<1 | 2>(1);
  const [sheetId, setSheetId] = useState<string | null>(recipe?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [ingSearch, setIngSearch] = useState('');
  const [ingTab, setIngTab] = useState<'mp' | 'sr'>('mp');
  const [localCategories, setLocalCategories] = useState<{ nom: string; atelier: string; pour?: string | null }[]>(categories);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatNom, setNewCatNom] = useState('');
  const pour = type === 'sous_recette' ? 'sous_recette' : 'recette';
  const allCategories = [...localCategories, ...categories.filter(c => !localCategories.some(lc => lc.nom === c.nom && lc.atelier === c.atelier))];

  async function saveNewCategory() {
    const nom = newCatNom.trim();
    if (!nom) return;
    const cat = { nom, atelier: form.atelier || '', pour };
    await supabase.from('categories').insert({ nom, atelier: form.atelier || null, pour, ordre: 99 });
    setLocalCategories(prev => [...prev, cat]);
    S('categorie', nom);
    setNewCatNom('');
    setAddingCat(false);
  }
  // ─── Étapes du procédé ───────────────────────────────────────────────────────
  interface EtapeLocal { id?: string; nom: string; duree_fixe_min: number | null; duree_par_piece_sec: number | null; materiel_id: string | null; mode: 'auto' | 'manuel' | null; pieces_par_plaque: number | null; plaques_par_niveau: number | null; niveaux: number | null; notes: string | null; }
  interface MaterielLight { id: string; nom: string; type: string; config: Record<string, unknown> | null; }
  const [etapes, setEtapes] = useState<EtapeLocal[]>([]);
  const [materiels, setMateriels] = useState<MaterielLight[]>([]);
  // Étapes des sous-recettes liées (pour suggestion d'import)
  const [srEtapes, setSrEtapes] = useState<Record<string, { nom: string; etapes: EtapeLocal[] }>>({});

  // Charger les étapes existantes + matériels si édition
  useEffect(() => {
    supabase.from('materiel').select('id, nom, type, config').order('nom')
      .then((res: { data: MaterielLight[] | null }) => setMateriels(res.data ?? []));
    if (!recipe?.id) return;
    supabase.from('etapes_recette').select('id, nom, duree_fixe_min, duree_par_piece_sec, materiel_id, mode, pieces_par_plaque, plaques_par_niveau, niveaux, notes')
      .eq('recipe_sheet_id', recipe.id).order('ordre')
      .then((res: { data: EtapeLocal[] | null }) => setEtapes(res.data ?? []));
  }, [recipe?.id]);

  // Charger les étapes des sous-recettes quand les lignes changent
  useEffect(() => {
    const srIds = form.lignes.filter(l => l.sous_recipe_id).map(l => l.sous_recipe_id as string);
    if (srIds.length === 0) { setSrEtapes({}); return; }
    Promise.all(srIds.map(srId =>
      supabase.from('etapes_recette').select('nom, duree_fixe_min, duree_par_piece_sec, notes').eq('recipe_sheet_id', srId).order('ordre')
        .then((res: { data: EtapeLocal[] | null }) => ({ srId, etapes: res.data ?? [] }))
    )).then(results => {
      const map: Record<string, { nom: string; etapes: EtapeLocal[] }> = {};
      results.forEach(({ srId, etapes: et }) => {
        if (et.length === 0) return;
        const sr = form.lignes.find(l => l.sous_recipe_id === srId)?.sous_recipe;
        map[srId] = { nom: sr?.nom ?? srId, etapes: et };
      });
      setSrEtapes(map);
    });
  }, [form.lignes]);

  function addEtape() {
    setEtapes(prev => [...prev, { nom: '', duree_fixe_min: null, duree_par_piece_sec: null, materiel_id: null, mode: null, pieces_par_plaque: null, plaques_par_niveau: null, niveaux: null, notes: null }]);
  }
  function updateEtape(idx: number, patch: Partial<EtapeLocal>) {
    setEtapes(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
  }
  function removeEtape(idx: number) {
    setEtapes(prev => prev.filter((_, i) => i !== idx));
  }
  function moveEtape(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= etapes.length) return;
    setEtapes(prev => { const a = [...prev]; [a[idx], a[next]] = [a[next], a[idx]]; return a; });
  }
  function importerSR(srId: string) {
    const sr = srEtapes[srId];
    if (!sr) return;
    setEtapes(prev => [...prev, ...sr.etapes.map(e => ({ nom: e.nom, duree_fixe_min: e.duree_fixe_min, duree_par_piece_sec: e.duree_par_piece_sec, materiel_id: e.materiel_id, mode: e.mode, pieces_par_plaque: e.pieces_par_plaque, plaques_par_niveau: e.plaques_par_niveau, niveaux: e.niveaux, notes: e.notes }))]);
  }
  const [simQty, setSimQty] = useState(100);

  function etapeMin(e: EtapeLocal, qty: number): number {
    let t = e.duree_fixe_min ?? 0;
    if (e.duree_par_piece_sec && qty > 0) t += (e.duree_par_piece_sec * qty) / 60;
    return t;
  }

  const totalProcMin = etapes.reduce((s, e) => s + etapeMin(e, simQty), 0);

  function fmtProcMin(min: number) {
    if (min <= 0) return '';
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60); const m = Math.round(min % 60);
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  // ─── États du produit ────────────────────────────────────────────────────────
  const [etatsActifs, setEtatsActifs] = useState<string[]>(() => {
    if (recipe?.etats_config) return Object.keys(recipe.etats_config);
    return [];
  });
  const [etatsConfig, setEtatsConfig] = useState<EtatsConfig>(() => recipe?.etats_config ?? {});
  // Unité DLC par état : 'h' (heures) ou 'j' (jours) — stockage toujours en heures
  const [etatsDlcUnit, setEtatsDlcUnit] = useState<Record<string, 'h' | 'j'>>(() => {
    const units: Record<string, 'h' | 'j'> = {};
    if (recipe?.etats_config) {
      Object.entries(recipe.etats_config).forEach(([etat, cfg]) => {
        const h = (cfg as EtatConfig).dlc_heures;
        units[etat] = h && h >= 24 && h % 24 === 0 ? 'j' : 'h';
      });
    }
    return units;
  });

  // Auto-activer les états (sera initialisé après refArticles — voir useEffect plus bas)

  function toggleEtat(etat: string) {
    setEtatsActifs(prev =>
      prev.includes(etat) ? prev.filter(e => e !== etat) : [...prev, etat]
    );
  }

  function updateEtatDlc(etat: string, dlc: number | null) {
    setEtatsConfig(prev => ({
      ...prev,
      [etat]: { ...(prev[etat] ?? { dlc_heures: null, overrides: {} }), dlc_heures: dlc },
    }));
  }

  function toggleSkip(etat: string, idx: number) {
    setEtatsConfig(prev => {
      const cfg = prev[etat] ?? { dlc_heures: null, overrides: {} };
      const cur = cfg.overrides[idx] ?? {};
      return {
        ...prev,
        [etat]: { ...cfg, overrides: { ...cfg.overrides, [idx]: { ...cur, skip: !cur.skip } } },
      };
    });
  }

  function updateDureeOverride(etat: string, idx: number, duree: number | null) {
    setEtatsConfig(prev => {
      const cfg = prev[etat] ?? { dlc_heures: null, overrides: {} };
      const cur = cfg.overrides[idx] ?? {};
      return {
        ...prev,
        [etat]: { ...cfg, overrides: { ...cfg.overrides, [idx]: { ...cur, duree } } },
      };
    });
  }

  function buildEtatsConfigToSave(): EtatsConfig {
    const result: EtatsConfig = {};
    etatsActifs.forEach(etat => {
      result[etat] = etatsConfig[etat] ?? { dlc_heures: null, overrides: {} };
    });
    return result;
  }

  // Gabarits (formats) de la sous-recette en cours d'édition
  const [localGabarits, setLocalGabarits] = useState<Gabarit[]>(() => recipe?.gabarits || []);
  const [newGabNom, setNewGabNom] = useState('');
  const [newGabPoids, setNewGabPoids] = useState('');

  function addGabarit() {
    const nom = newGabNom.trim();
    const poids_kg = parseFloat(newGabPoids);
    if (!nom || !poids_kg || poids_kg <= 0) return;
    setLocalGabarits(prev => [...prev, { nom, poids_kg }]);
    setNewGabNom('');
    setNewGabPoids('');
  }

  function removeGabarit(idx: number) {
    setLocalGabarits(prev => prev.filter((_, i) => i !== idx));
  }

  // Sélecteur de gabarit ouvert sur une ligne d'ingrédient SR
  const [gabOpenIdx, setGabOpenIdx] = useState<number | null>(null);

  const [srModes, setSrModes] = useState<Record<number, 'kg' | 'dose'>>({});
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});
  const [targetMarge, setTargetMarge] = useState(65);
  const [baseSearch, setBaseSearch] = useState('');
  const [baseOpen, setBaseOpen] = useState(false);
  const [baseLoaded, setBaseLoaded] = useState<{ id: string; nom: string; count: number; rendement: number } | null>(null);
  const [baseQty, setBaseQty] = useState(0);
  const [baseOriginalLignes, setBaseOriginalLignes] = useState<IngredientLine[]>([]);
  const [calcMode, setCalcMode] = useState<'manuel' | 'poids'>(() =>
    isEdit && (recipe?.poids_portion_g ?? 0) > 0 ? 'poids' : 'manuel'
  );
  const baseRef = useRef<HTMLDivElement>(null);
  const [refArticles, setRefArticles] = useState<ProductArticleForRecipe[]>([]);
  const [refSearch, setRefSearch] = useState('');
  const [refOpen, setRefOpen] = useState(false);
  const refContainerRef = useRef<HTMLDivElement>(null);

  // DLC par article — surcharge localStorage
  const ARTICLE_DLC_DEFAULT: Record<string, number> = { frais: 2, pre_cuit: 4, pre_pousse: 1, congele: 30 }; // en jours
  const [articleDlcOverrides, setArticleDlcOverrides] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('article_dlc_overrides') || '{}'); } catch { return {}; }
  });
  const [editingDlc, setEditingDlc] = useState<string | null>(null);

  function getArticleDlc(art: ProductArticleForRecipe): number {
    if (articleDlcOverrides[art.id] != null) return articleDlcOverrides[art.id];
    if (art.product_state && ARTICLE_DLC_DEFAULT[art.product_state]) return ARTICLE_DLC_DEFAULT[art.product_state];
    return 3;
  }

  function saveArticleDlc(artId: string, hours: number) {
    setArticleDlcOverrides(prev => {
      const next = { ...prev, [artId]: hours };
      localStorage.setItem('article_dlc_overrides', JSON.stringify(next));
      return next;
    });
    setEditingDlc(null);
  }

  // Fetch articles de la référence sélectionnée
  useEffect(() => {
    if (!form.produitId || type !== 'recette') { setRefArticles([]); return; }
    supabase.from('product_articles')
      .select('id, display_name, quantity, pack_type, product_state, prix_pro, prix_particulier, custom_price')
      .eq('product_reference_id', form.produitId)
      .eq('is_active', true)
      .order('quantity')
      .then(({ data }: { data: ProductArticleForRecipe[] | null }) => setRefArticles(data || []));
  }, [form.produitId, type]);

  // Auto-complétion du nom depuis la référence (création uniquement)
  useEffect(() => {
    if (isEdit || type !== 'recette' || !form.produitId) return;
    const ref = productReferences.find(r => r.id === form.produitId);
    if (ref) setForm(f => ({ ...f, nom: f.nom || ref.name }));
  }, [form.produitId]);

  // Auto-activer les états depuis les articles de la référence
  useEffect(() => {
    if (!refArticles.length) return;
    const statesFromRef = [...new Set(refArticles.map(a => a.product_state).filter(Boolean))] as string[];
    if (statesFromRef.length === 0) return;
    setEtatsActifs(prev => [...new Set([...prev, ...statesFromRef])]);
  }, [refArticles]);

  // Fermer le dropdown référence au clic extérieur
  useEffect(() => {
    if (!refOpen) return;
    const fn = (e: MouseEvent) => {
      if (!refContainerRef.current?.contains(e.target as Node)) { setRefOpen(false); setRefSearch(''); }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [refOpen]);

  // Fermer dropdown base au clic extérieur
  useEffect(() => {
    if (!baseOpen) return;
    const fn = (e: MouseEvent) => {
      if (!baseRef.current?.contains(e.target as Node)) { setBaseOpen(false); setBaseSearch(''); }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [baseOpen]);

  // Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  function loadBase(sr: RecipeSheet) {
    const baseIngredients: IngredientLine[] = (sr.ingredients || []).map(ing => ({ ...ing, id: undefined }));
    const totalKg = calcPoidsKg(baseIngredients, sousRecettes);
    setBaseOriginalLignes(baseIngredients);
    setBaseQty(totalKg > 0 ? Math.round(totalKg * 1000) / 1000 : sr.rendement || 1);
    setBaseLoaded({ id: sr.id, nom: sr.nom, count: baseIngredients.length, rendement: totalKg || sr.rendement || 1 });
    setForm(f => ({ ...f, lignes: [...baseIngredients, ...f.lignes.slice(baseLoaded?.count ?? 0)] }));
    setBaseOpen(false);
    setBaseSearch('');
  }

  function applyBaseQty(qty: number) {
    if (!baseLoaded || baseOriginalLignes.length === 0) return;
    const factor = qty / (baseLoaded.rendement || 1);
    const scaled = baseOriginalLignes.map(l => ({ ...l, quantite: Math.round(l.quantite * factor * 100000) / 100000 }));
    setBaseQty(qty);
    setForm(f => ({ ...f, lignes: [...scaled, ...f.lignes.slice(baseLoaded.count)] }));
  }

  // ── Calculs live ────────────────────────────────────────────────────────────
  const totalKgBrut = useMemo(() => calcPoidsKg(form.lignes, sousRecettes), [form.lignes, sousRecettes]);

  const rendementCalc = useMemo(() => {
    if (form.poidsPortionG <= 0 || totalKgBrut <= 0) return 0;
    const kgNet = totalKgBrut * (1 - form.pertePct / 100);
    return Math.max(1, Math.floor(kgNet * 1000 / form.poidsPortionG));
  }, [totalKgBrut, form.pertePct, form.poidsPortionG]);

  const effectiveRendement = calcMode === 'poids' && rendementCalc > 0 ? rendementCalc : form.rendement;

  const { coutBrut, coutAvecPerte, coutUnitaire } = useMemo(
    () => calcLignes(form.lignes, sousRecettes, form.pertePct, effectiveRendement, type === 'recette'),
    [form.lignes, form.pertePct, effectiveRendement, sousRecettes, type]
  );

  const selectedRef = productReferences.find(r => r.id === form.produitId);
  const prixVente = useMemo(() => {
    if (selectedRef?.base_unit_price && selectedRef.base_unit_price > 0) return selectedRef.base_unit_price;
    if (refArticles.length > 0) {
      const sorted = [...refArticles].sort((a, b) => a.quantity - b.quantity);
      for (const art of sorted) {
        const p = art.prix_pro ?? art.prix_particulier ?? art.custom_price;
        if (p && p > 0) return p / art.quantity;
      }
    }
    // Fallback sur prix_cible saisi manuellement
    if (form.prixCible > 0) return form.prixCible;
    return null;
  }, [selectedRef, refArticles, form.prixCible]);
  const marge = prixVente !== null ? prixVente - coutUnitaire : null;
  const tauxMarge = marge !== null && prixVente && prixVente > 0 ? (marge / prixVente) * 100 : null;
  const suggestedUnitPrice = coutUnitaire > 0 ? coutUnitaire / (1 - targetMarge / 100) : 0;

  const filteredRefs = productReferences.filter(r =>
    refSearch.length === 0 || r.name.toLowerCase().includes(refSearch.toLowerCase())
  ).slice(0, 12);

  const filteredItems = ingTab === 'sr'
    ? sousRecettes.filter(sr => sr.id !== recipe?.id && (ingSearch.length === 0 || sr.nom.toLowerCase().includes(ingSearch.toLowerCase()))).slice(0, 20)
    : ingSearch.length > 0 ? stockItems.filter(i => i.nom.toLowerCase().includes(ingSearch.toLowerCase())).slice(0, 8) : [];

  function addLine(item: StockItemLight | RecipeSheet, tab: 'mp' | 'sr') {
    setForm(f => ({
      ...f,
      lignes: [...f.lignes, tab === 'mp'
        ? { stock_item_id: item.id, quantite: 1, stock_item: item as StockItemLight }
        : { sous_recipe_id: item.id, quantite: 1, sous_recipe: item as RecipeSheet }],
    }));
    setIngSearch('');
  }

  function removeLine(idx: number) { setForm(f => ({ ...f, lignes: f.lignes.filter((_, i) => i !== idx) })); }
  function updateQty(idx: number, qty: number) { setForm(f => ({ ...f, lignes: f.lignes.map((l, i) => i === idx ? { ...l, quantite: qty } : l) })); }
  function toggleAllergene(a: string) {
    setForm(f => ({ ...f, allergenes: f.allergenes.includes(a) ? f.allergenes.filter(x => x !== a) : [...f.allergenes, a] }));
  }

  // Étape 1 → sauvegarde recette + ingrédients + gabarits, passe à l'étape 2
  async function handleNext() {
    if (!form.nom.trim()) return;
    if (type === 'recette' && tauxMarge !== null && tauxMarge < 10) {
      if (!confirm(`Attention : marge de ${tauxMarge.toFixed(0)}% — en dessous du seuil critique (10%). Continuer quand même ?`)) return;
    }
    setSaving(true);
    const basePayload: Record<string, any> = {
      nom: form.nom.trim(),
      rendement: calcMode === 'poids' ? Math.max(1, rendementCalc) : form.rendement,
      perte_pct: form.pertePct, atelier: form.atelier || null,
      categorie: form.categorie || null, notes: form.notes || null,
      procede: form.procede || null,
      product_reference_id: form.produitId || null,
      prix_cible: form.prixCible > 0 ? form.prixCible : null,
      allergenes: form.allergenes.length > 0 ? form.allergenes : null,
      poids_portion_g: calcMode === 'poids' && form.poidsPortionG > 0 ? form.poidsPortionG : null,
      unite: form.unite?.trim() || null,
      delai_fabrication_h: form.delaiH > 0 ? form.delaiH : null,
      dlc_heures: form.dlcHeures > 0 ? form.dlcHeures : null,
      stock_min: form.stockMin > 0 ? form.stockMin : null,
    };
    try {
      let sid = sheetId;
      if (isEdit) {
        const { error } = await supabase.from('recipe_sheets').update(basePayload).eq('id', recipe!.id);
        if (error) throw new Error('Recette: ' + error.message);
        sid = recipe!.id;
      } else {
        const { data, error } = await supabase.from('recipe_sheets').insert({ ...basePayload, type }).select().single();
        if (error) throw new Error('Recette: ' + error.message);
        sid = data?.id;
      }
      if (sid) {
        setSheetId(sid);
        await supabase.from('recipe_ingredients').delete().eq('recipe_sheet_id', sid);
        const valid = form.lignes.filter(l => l.stock_item_id || l.sous_recipe_id);
        if (valid.length > 0) {
          const { error } = await supabase.from('recipe_ingredients').insert(valid.map(l => ({
            recipe_sheet_id: sid, stock_item_id: l.stock_item_id || null,
            sous_recipe_id: l.sous_recipe_id || null, quantite: l.quantite,
            gabarit_nom: l.gabarit_nom || null, gabarit_poids_kg: l.gabarit_poids_kg || null,
          })));
          if (error) throw new Error('Ingrédients: ' + error.message);
        }
        if (type === 'sous_recette') {
          await supabase.from('recipe_sheet_gabarits').delete().eq('recipe_sheet_id', sid);
          if (localGabarits.length > 0) {
            const { error } = await supabase.from('recipe_sheet_gabarits').insert(
              localGabarits.map(g => ({ recipe_sheet_id: sid, nom: g.nom, poids_kg: g.poids_kg }))
            );
            if (error) throw new Error('Gabarits: ' + error.message);
          }
        }
      }
      setStep(2);
    } catch (err: any) {
      alert('Erreur : ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  // Étape 2 → sauvegarde les étapes + états config et ferme
  async function handleSave() {
    if (!sheetId) return;
    setSaving(true);
    try {
      await supabase.from('etapes_recette').delete().eq('recipe_sheet_id', sheetId);
      const validEtapes = etapes.filter(e => e.nom.trim());
      if (validEtapes.length > 0) {
        const { error } = await supabase.from('etapes_recette').insert(
          validEtapes.map((e, i) => ({
            recipe_sheet_id: sheetId, ordre: i, nom: e.nom.trim(),
            duree_fixe_min: e.duree_fixe_min || null,
            duree_par_piece_sec: e.duree_par_piece_sec || null,
            materiel_id: e.materiel_id || null,
            mode: e.mode || null,
            pieces_par_plaque: e.pieces_par_plaque || null,
            plaques_par_niveau: e.plaques_par_niveau || null,
            niveaux: e.niveaux || null,
            notes: e.notes?.trim() || null,
            poste_id: null, necessite_personnel: false,
          }))
        );
        if (error) throw new Error('Étapes: ' + error.message);
      }
      // Sauvegarder les états du produit
      const { error: etatErr } = await supabase
        .from('recipe_sheets')
        .update({ etats_config: buildEtatsConfigToSave() })
        .eq('id', sheetId);
      if (etatErr) throw new Error('États: ' + etatErr.message);

      await onSaved();
      onClose();
    } catch (err: any) {
      alert('Erreur : ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  const S = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onMouseDown={onClose}>
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-black text-gray-900">
              {isEdit ? 'Modifier la recette' : type === 'recette' ? 'Nouvelle recette' : 'Nouvelle sous-recette'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                1 Recette
              </span>
              <span className="text-gray-200 text-xs">→</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                2 Procédé
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === 1 && !isEdit && (
              <button onClick={() => setForm(emptyState())}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
                <RotateCcw size={13} /> <span className="hidden sm:inline">Réinitialiser</span>
              </button>
            )}
            {step === 1 && (
              <button onClick={handleNext} disabled={saving || !form.nom.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-blue-700">
                {saving ? 'Enregistrement…' : <>Suivant <ChevronRight size={14} /></>}
              </button>
            )}
            {step === 2 && (
              <>
                <button onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
                  <ChevronLeft size={14} /> Retour
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-blue-700">
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corps */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* ── ÉTAPE 2 : Procédé ── */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Procédé de fabrication</p>
                <div className="flex items-center gap-2">
                  {/* Simulateur quantité */}
                  {etapes.some(e => e.duree_par_piece_sec) && (
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-xl px-3 py-1.5">
                      <span className="text-xs text-orange-500 font-semibold">Qté</span>
                      <input type="number" min={1} step={1} value={simQty}
                        onChange={ev => setSimQty(parseInt(ev.target.value) || 1)}
                        className="w-16 text-xs text-center font-bold text-orange-700 bg-transparent focus:outline-none border-b border-orange-300" />
                      <span className="text-xs text-orange-400">pièces</span>
                    </div>
                  )}
                  {totalProcMin > 0 && (
                    <span className="flex items-center gap-1.5 text-sm font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl">
                      ⏱ {fmtProcMin(totalProcMin)}
                    </span>
                  )}
                </div>
              </div>

              {/* Suggestions depuis sous-recettes */}
              {Object.entries(srEtapes).map(([srId, sr]) => (
                <div key={srId} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <span className="text-sm text-indigo-700 font-semibold truncate">{sr.nom}</span>
                  <span className="text-xs text-indigo-400">{sr.etapes.length} étape{sr.etapes.length > 1 ? 's' : ''}</span>
                  <button type="button" onClick={() => importerSR(srId)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shrink-0">
                    <Plus size={11} /> Importer
                  </button>
                </div>
              ))}

              {/* Liste étapes */}
              <div className="space-y-1.5">
                {etapes.map((e, idx) => (
                  <div key={idx} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 group shadow-sm">
                    {/* Ligne 1 : numéro + nom + mode + poubelle */}
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col shrink-0">
                        <button type="button" onClick={() => moveEtape(idx, -1)} disabled={idx === 0}
                          className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-20"><ChevronUp size={10} /></button>
                        <button type="button" onClick={() => moveEtape(idx, 1)} disabled={idx === etapes.length - 1}
                          className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-20"><ChevronDown size={10} /></button>
                      </div>
                      <span className="text-xs font-black text-gray-300 w-4 text-center shrink-0">{idx + 1}</span>
                      <input type="text" value={e.nom}
                        onChange={ev => updateEtape(idx, { nom: ev.target.value })}
                        placeholder={`Étape ${idx + 1}…`}
                        className="flex-1 text-sm font-semibold text-gray-800 bg-transparent focus:outline-none placeholder:text-gray-300 min-w-0" />
                      {/* Mode auto/manuel */}
                      <div className="flex rounded-lg overflow-hidden shrink-0 text-xs font-bold border border-gray-200">
                        <button type="button"
                          onClick={() => updateEtape(idx, { mode: e.mode === 'auto' ? null : 'auto' })}
                          className={`px-2.5 py-1 transition-colors ${e.mode === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-gray-500 bg-white'}`}>
                          Auto
                        </button>
                        <button type="button"
                          onClick={() => updateEtape(idx, { mode: e.mode === 'manuel' ? null : 'manuel' })}
                          className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${e.mode === 'manuel' ? 'bg-amber-500 text-white' : 'text-gray-300 hover:text-gray-500 bg-white'}`}>
                          Manuel
                        </button>
                      </div>
                      <button type="button" onClick={() => removeEtape(idx)}
                        className="p-1 text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {/* Ligne 2 : durées + matériel + bouton fournée */}
                    <div className="flex items-center gap-3 mt-1.5 pl-8">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={0} step={1} value={e.duree_fixe_min ?? ''}
                          onChange={ev => updateEtape(idx, { duree_fixe_min: parseInt(ev.target.value) || null })}
                          placeholder="—"
                          className="w-12 text-xs text-center font-bold text-gray-600 border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        <span className="text-xs text-gray-400">min</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={0} step={0.5} value={e.duree_par_piece_sec ?? ''}
                          onChange={ev => updateEtape(idx, { duree_par_piece_sec: parseFloat(ev.target.value) || null })}
                          placeholder="—"
                          className="w-12 text-xs text-center font-bold text-orange-500 border border-orange-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-orange-50" />
                        <span className="text-xs text-gray-400">s/pce</span>
                      </div>
                      <select
                        value={e.materiel_id ?? ''}
                        onChange={ev => updateEtape(idx, { materiel_id: ev.target.value || null })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 flex-1 min-w-0">
                        <option value="">— Matériel —</option>
                        {materiels.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                      </select>
                    </div>
                    {/* Ligne 3 : pièces/plaque si four sélectionné */}
                    {(() => {
                      const mat = materiels.find(m => m.id === e.materiel_id);
                      if (!mat || mat.type !== 'four') return null;
                      const fc = mat.config as { type_four?: string; nb_niveaux?: number; plaques_par_niveau?: number; soles?: { plaques: number }[]; nb_plaques?: number } | null;
                      const totalPlaques = !fc ? 0
                        : fc.type_four === 'ventile' ? (fc.nb_niveaux ?? 0) * (fc.plaques_par_niveau ?? 0)
                        : fc.type_four === 'sol' ? (fc.soles ?? []).reduce((s: number, sol: { plaques: number }) => s + sol.plaques, 0)
                        : fc.type_four === 'rotatif' ? (fc.nb_plaques ?? 0)
                        : 0;
                      const capacite = (e.pieces_par_plaque ?? 0) * totalPlaques;
                      return (
                        <div className="mt-2 ml-8 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                          <span className="text-xs text-red-400 font-semibold shrink-0">🔥 Fournée</span>
                          <input type="number" min={1} step={1} value={e.pieces_par_plaque ?? ''}
                            onChange={ev => updateEtape(idx, { pieces_par_plaque: parseInt(ev.target.value) || null })}
                            placeholder="—"
                            className="w-14 text-xs text-center font-bold text-red-700 border border-red-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-300" />
                          <span className="text-xs text-red-400">pce/plaque</span>
                          {totalPlaques > 0 && <span className="text-xs text-red-300">× {totalPlaques} plaques</span>}
                          {capacite > 0 && <span className="ml-auto text-sm font-black text-red-600 shrink-0">= {capacite} pce/fournée</span>}
                        </div>
                      );
                    })()}
                  </div>
                ))}
                <button type="button" onClick={addEtape}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 border border-dashed border-gray-200 rounded-xl transition-colors">
                  <Plus size={13} /> Ajouter une étape
                </button>
              </div>

              {/* ── États du produit ── */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Déclinaisons par état</p>

                {/* Pills toggle */}
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_STATES.map(ps => {
                    const active = etatsActifs.includes(ps.value);
                    return (
                      <button key={ps.value} type="button" onClick={() => toggleEtat(ps.value)}
                        style={active ? { background: ps.bgColor, color: ps.color, borderColor: ps.color } : {}}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                          active ? '' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}>
                        {ps.label}
                      </button>
                    );
                  })}
                </div>

                {/* Cartes par état actif */}
                {etatsActifs.map(etatVal => {
                  const ps = PRODUCT_STATES.find(p => p.value === etatVal);
                  if (!ps) return null;
                  const cfg = etatsConfig[etatVal] ?? { dlc_heures: null, overrides: {} };
                  return (
                    <div key={etatVal} className="rounded-2xl overflow-hidden border" style={{ borderColor: ps.color + '55' }}>
                      {/* Header état */}
                      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: ps.bgColor }}>
                        <span className="font-black text-sm" style={{ color: ps.color }}>{ps.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium" style={{ color: ps.color }}>DLC</span>
                          <input
                            type="number" min={0} step={1}
                            value={(() => {
                              const h = cfg.dlc_heures;
                              if (h == null) return '';
                              return (etatsDlcUnit[etatVal] ?? 'h') === 'j' ? h / 24 : h;
                            })()}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              const unit = etatsDlcUnit[etatVal] ?? 'h';
                              updateEtatDlc(etatVal, isNaN(v) ? null : unit === 'j' ? Math.round(v * 24) : Math.round(v));
                            }}
                            placeholder="—"
                            className="w-14 text-xs text-center font-bold border border-white/60 rounded-lg px-2 py-1 bg-white/70 focus:outline-none focus:ring-2 focus:ring-white" />
                          {/* Toggle h / j */}
                          <div className="flex rounded-lg overflow-hidden border border-white/60 bg-white/40">
                            {(['h', 'j'] as const).map(unit => (
                              <button key={unit} type="button"
                                onClick={() => {
                                  const prev = etatsDlcUnit[etatVal] ?? 'h';
                                  if (prev === unit) return;
                                  // Convertir la valeur affichée
                                  const h = cfg.dlc_heures;
                                  if (h != null) {
                                    updateEtatDlc(etatVal, unit === 'j' ? h : h * 24);
                                  }
                                  setEtatsDlcUnit(u => ({ ...u, [etatVal]: unit }));
                                }}
                                className={`px-2 py-1 text-xs font-black transition-all ${
                                  (etatsDlcUnit[etatVal] ?? 'h') === unit
                                    ? 'bg-white/80 text-gray-800'
                                    : 'text-gray-500 hover:bg-white/40'
                                }`}>
                                {unit}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Étapes avec skip / override */}
                      {etapes.length === 0 ? (
                        <p className="text-xs text-gray-400 px-4 py-3 italic">Ajoutez des étapes ci-dessus pour les paramétrer par état.</p>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {etapes.map((e, idx) => {
                            const ov = cfg.overrides[idx] ?? {};
                            const skipped = ov.skip ?? false;
                            return (
                              <div key={idx} className={`flex items-center gap-3 px-4 py-2 transition-opacity ${skipped ? 'opacity-40' : ''}`}>
                                {/* Toggle skip */}
                                <button type="button" onClick={() => toggleSkip(etatVal, idx)}
                                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors border ${
                                    skipped
                                      ? 'bg-gray-100 border-gray-300 text-gray-400'
                                      : 'bg-green-100 border-green-300 text-green-600'
                                  }`}>
                                  {skipped ? <X size={9} /> : <Check size={9} />}
                                </button>
                                {/* Nom étape */}
                                <span className={`text-xs flex-1 font-medium ${skipped ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                  {e.nom || `Étape ${idx + 1}`}
                                </span>
                                {e.mode && !skipped && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                    e.mode === 'auto' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                                  }`}>{e.mode === 'auto' ? 'Auto' : 'Manuel'}</span>
                                )}
                                {/* Override durée */}
                                {!skipped && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <input type="number" min={0} value={ov.duree ?? ''}
                                      onChange={ev => updateDureeOverride(etatVal, idx, parseInt(ev.target.value) || null)}
                                      placeholder={e.duree_fixe_min ? String(e.duree_fixe_min) : '—'}
                                      className="w-14 text-xs text-center font-bold border border-gray-200 rounded-lg px-1 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                    <span className="text-[10px] text-gray-400">min</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ÉTAPE 1 : Recette ── */}
          {step === 1 && <>

          {/* BLOC 1 — Informations */}
          <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Informations</p>

            {/* Référence produit — EN PREMIER pour les recettes */}
            {type === 'recette' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Référence produit</span>
                <div ref={refContainerRef} className="relative" style={{ zIndex: refOpen ? 100 : undefined }}>
                  <div onClick={() => setRefOpen(o => !o)}
                    className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 transition-colors">
                    {selectedRef ? (
                      <>
                        <span className="flex-1 text-sm font-semibold text-gray-900">{selectedRef.name}</span>
                        <span className="text-xs text-gray-400">{selectedRef.base_unit_price.toFixed(2)} MAD/u.</span>
                        <button type="button" onMouseDown={e => { e.stopPropagation(); e.preventDefault(); S('produitId', ''); }}
                          className="text-gray-300 hover:text-gray-600 ml-1"><X size={13} /></button>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400 flex-1">Sélectionner une référence produit…</span>
                    )}
                  </div>
                  {refOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden" style={{ zIndex: 200 }}>
                      <input autoFocus value={refSearch} onChange={e => setRefSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && (setRefOpen(false), setRefSearch(''))}
                        placeholder="Rechercher…"
                        className="w-full px-3 py-2.5 text-sm focus:outline-none border-b border-gray-100" />
                      <div className="max-h-52 overflow-y-auto">
                        {filteredRefs.map(r => (
                          <button key={r.id} type="button"
                            onMouseDown={e => {
                              e.preventDefault(); // empêche le blur de l'input de fermer le dropdown
                              S('produitId', r.id);
                              setRefOpen(false);
                              setRefSearch('');
                            }}
                            className={`w-full text-left px-3 py-2.5 text-sm flex justify-between items-center border-b border-gray-50 last:border-0 hover:bg-blue-50 ${r.id === form.produitId ? 'bg-blue-50 font-semibold' : ''}`}>
                            <span className="font-medium text-gray-800">{r.name}</span>
                            <span className="text-gray-400 text-xs">{r.base_unit_price.toFixed(2)} MAD</span>
                          </button>
                        ))}
                        {filteredRefs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucun résultat</p>}
                      </div>
                    </div>
                  )}
                </div>
              </label>
            )}

            {/* Nom */}
            <input value={form.nom} onChange={e => S('nom', e.target.value)}
              placeholder={type === 'recette' ? 'Nom de la recette *' : 'Nom de la sous-recette *'}
              autoFocus={type === 'sous_recette'}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Atelier</span>
                <select value={form.atelier} onChange={e => { S('atelier', e.target.value); S('categorie', ''); }}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Choisir</option>
                  {ateliers.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Catégorie</span>
                {addingCat ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      type="text"
                      value={newCatNom}
                      onChange={e => setNewCatNom(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveNewCategory(); if (e.key === 'Escape') setAddingCat(false); }}
                      placeholder="Nom de la catégorie..."
                      className="flex-1 px-3 py-2.5 border border-blue-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={saveNewCategory} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">OK</button>
                    <button onClick={() => setAddingCat(false)} className="px-3 py-2 text-gray-400 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">✕</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <select value={form.categorie} onChange={e => S('categorie', e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Choisir</option>
                      {allCategories
                        .filter(c => (!c.pour || c.pour === pour) && (!form.atelier || !c.atelier || c.atelier === form.atelier))
                        .map((c, i) => (
                          <option key={`${c.atelier}-${c.nom}-${i}`} value={c.nom}>{c.nom}</option>
                        ))}
                    </select>
                    <button onClick={() => setAddingCat(true)} title="Nouvelle catégorie"
                      className="px-3 py-2 border border-gray-200 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-300 text-lg leading-none">
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>

            {type === 'recette' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Marge cible</span>
                <div className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-xl">
                  <input type="range" min={10} max={90} step={5} value={targetMarge}
                    onChange={e => setTargetMarge(parseInt(e.target.value))}
                    className="flex-1 accent-blue-600 h-1.5" />
                  <span className={`text-sm font-black w-10 text-right ${targetMarge >= 60 ? 'text-green-600' : targetMarge >= 30 ? 'text-blue-600' : 'text-red-600'}`}>
                    {targetMarge}%
                  </span>
                </div>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Perte %</span>
                <input type="number" min={0} max={100} step={0.1} value={form.pertePct}
                  onChange={e => S('pertePct', parseFloat(e.target.value) || 0)}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Unité</span>
                <input
                  list="unites-predefinies"
                  value={form.unite}
                  onChange={e => S('unite', e.target.value)}
                  placeholder="pièce"
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="unites-predefinies">
                  {UNITES_PREDEFINIES.map(u => <option key={u} value={u} />)}
                </datalist>
              </label>
            </div>

            {/* Mode rendement */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-semibold px-1">Rendement</span>
                <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
                  <button type="button" onClick={() => setCalcMode('manuel')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${calcMode === 'manuel' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                    Manuel
                  </button>
                  <button type="button" onClick={() => setCalcMode('poids')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${calcMode === 'poids' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                    Par poids/pièce
                  </button>
                </div>
              </div>

              {calcMode === 'manuel' ? (
                <input type="number" min={1} value={form.rendement} onChange={e => S('rendement', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input type="number" min={0.1} step={0.1}
                      value={form.poidsPortionG || ''}
                      onChange={e => S('poidsPortionG', parseFloat(e.target.value) || 0)}
                      placeholder="Ex : 80"
                      className="w-full px-3 py-2.5 pr-20 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                      g/{form.unite || 'pièce'}
                    </span>
                  </div>
                  {rendementCalc > 0 ? (
                    <div className="shrink-0 bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl text-center min-w-[76px]">
                      <p className="text-[10px] text-blue-400 font-semibold leading-none mb-0.5">Théorique</p>
                      <p className="text-xl font-black text-blue-700 leading-none">{rendementCalc}</p>
                      <p className="text-[10px] text-blue-400 leading-none mt-0.5">{form.unite || 'pièce'}{rendementCalc > 1 ? 's' : ''}</p>
                    </div>
                  ) : (
                    <div className="shrink-0 bg-gray-50 px-3 py-2.5 rounded-xl text-center min-w-[76px]">
                      <p className="text-xs text-gray-300">Saisissez</p>
                      <p className="text-xs text-gray-300">le poids</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* BLOC 2 — Composition */}
          <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Composition</p>
              {type === 'sous_recette' && (
                <div ref={baseRef} className="relative">
                  {baseLoaded ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 border border-purple-200 rounded-xl">
                      <span className="text-[10px] font-black text-purple-500 uppercase tracking-wide shrink-0">Base</span>
                      <span className="text-xs font-semibold text-purple-700 shrink-0">{baseLoaded.nom}</span>
                      <span className="text-purple-300 text-xs">·</span>
                      <input
                        type="number" min={0.001} step={0.01}
                        value={baseQty}
                        onChange={e => applyBaseQty(parseFloat(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        className="w-16 text-xs font-black text-purple-700 text-center bg-transparent focus:outline-none focus:bg-white focus:border focus:border-purple-300 focus:rounded-lg px-1"
                      />
                      <span className="text-[10px] text-purple-400 shrink-0">kg</span>
                      <button type="button" onClick={() => { setBaseLoaded(null); setBaseOriginalLignes([]); setBaseQty(0); setForm(f => ({ ...f, lignes: [] })); }}
                        className="text-purple-300 hover:text-purple-600 ml-0.5"><X size={11} /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setBaseOpen(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-600 border border-purple-200 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors">
                      <Plus size={12} /> Charger une base
                    </button>
                  )}
                  {baseOpen && (
                    <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
                      <input autoFocus value={baseSearch} onChange={e => setBaseSearch(e.target.value)}
                        placeholder="Rechercher une sous-recette…"
                        className="w-full px-3 py-2.5 text-sm focus:outline-none border-b border-gray-100" />
                      <div className="max-h-52 overflow-y-auto">
                        {sousRecettes
                          .filter(sr => sr.id !== recipe?.id && (baseSearch.length === 0 || sr.nom.toLowerCase().includes(baseSearch.toLowerCase())))
                          .slice(0, 15)
                          .map(sr => (
                            <button key={sr.id} type="button" onClick={() => loadBase(sr)}
                              className="w-full text-left px-3 py-2.5 text-sm flex justify-between items-center border-b border-gray-50 last:border-0 hover:bg-purple-50">
                              <span className="font-medium text-gray-800">{sr.nom}</span>
                              <span className="text-gray-400 text-xs">{(sr.ingredients || []).length} ing.</span>
                            </button>
                          ))}
                        {sousRecettes.filter(sr => sr.id !== recipe?.id && (baseSearch.length === 0 || sr.nom.toLowerCase().includes(baseSearch.toLowerCase()))).length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-4">Aucune sous-recette</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {form.lignes.length > 0 && (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[300px]">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left pb-2">Ingrédient</th>
                    <th className="text-right pb-2 w-24">Qté</th>
                    <th className="text-right pb-2 hidden sm:table-cell w-24">PMP</th>
                    <th className="text-right pb-2 w-20">Coût</th>
                    <th className="text-right pb-2 w-12">%</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {form.lignes.map((l, idx) => {
                    const isSR = !!l.sous_recipe_id;
                    const srMode = isSR ? (srModes[idx] ?? 'kg') : 'kg';
                    const srRendement = isSR && l.sous_recipe ? (l.sous_recipe.rendement || 1) : 1;

                    // Mode gabarit : quantite = fonds, kg réels = quantite × gabarit_poids_kg
                    const isGab = isSR && !!l.gabarit_nom && !!l.gabarit_poids_kg;
                    const gabKgPerUnit = isGab ? (l.gabarit_poids_kg || 0) : 0;

                    // PMP et coût selon le mode
                    const pmpKg = isSR ? (l.sous_recipe ? calcSousRecetteParKg(l.sous_recipe, sousRecettes) : 0) : (l.stock_item?.prix_moyen_pondere || 0);
                    const pmpDose = isSR && l.sous_recipe ? calcSousRecette(l.sous_recipe, sousRecettes) : 0;
                    const pmpDisplay = isGab ? (pmpKg * gabKgPerUnit) : (srMode === 'dose' ? pmpDose : pmpKg);

                    // kg produits par dose (pour conversion kg ↔ dose)
                    const kgFiniParDose = isSR && pmpKg > 0 ? pmpDose / pmpKg : (srRendement || 1);

                    // Valeur affichée dans l'input
                    const displayQty = isGab ? l.quantite : (srMode === 'dose'
                      ? Math.round(l.quantite / kgFiniParDose * 10000) / 10000
                      : l.quantite);

                    // Coût : gabarit = fonds × poids/fond × pmpKg ; sinon standard kg
                    const cout = isGab ? l.quantite * gabKgPerUnit * pmpKg : l.quantite * pmpKg;
                    const pct = coutBrut > 0 ? (cout / coutBrut) * 100 : 0;
                    const isFirstExtra = baseLoaded && idx === baseLoaded.count;
                    return (
                      <React.Fragment key={idx}>
                        {isFirstExtra && (
                          <tr>
                            <td colSpan={6} className="pt-3 pb-1">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-purple-100" />
                                <span className="text-[10px] font-black text-purple-400 uppercase tracking-wider">Ingrédients additionnels</span>
                                <div className="flex-1 h-px bg-purple-100" />
                              </div>
                            </td>
                          </tr>
                        )}
                      <tr className="border-t border-gray-50">
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            {isSR ? (
                              <button type="button"
                                onClick={() => setSrModes(m => ({ ...m, [idx]: m[idx] === 'dose' ? 'kg' : 'dose' }))}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-black transition-colors ${srMode === 'dose' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'}`}
                                title={srMode === 'dose' ? 'Mode dose — cliquer pour passer en kg' : 'Mode kg — cliquer pour passer en dose'}>
                                {srMode === 'dose' ? 'DOSE' : 'SR'}
                              </button>
                            ) : null}
                            <span className="text-gray-800 text-sm">{isSR ? l.sous_recipe?.nom : l.stock_item?.nom}</span>
                            {!isSR && l.stock_item && <span className="text-gray-400 text-xs ml-0.5">({l.stock_item.unite})</span>}
                            {isSR && (() => {
                              const srGabs = l.sous_recipe?.gabarits || [];
                              if (srGabs.length === 0) return null;
                              return (
                                <div className="relative">
                                  <button type="button"
                                    onClick={() => setGabOpenIdx(gabOpenIdx === idx ? null : idx)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-black transition-colors border ${l.gabarit_nom ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-purple-300'}`}>
                                    {l.gabarit_nom || '+ format'}
                                  </button>
                                  {gabOpenIdx === idx && (
                                    <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-xl shadow-xl z-20 min-w-[140px] overflow-hidden">
                                      <button type="button" onClick={() => {
                                        setForm(f => ({ ...f, lignes: f.lignes.map((ll, i) => i === idx ? { ...ll, gabarit_nom: null, gabarit_poids_kg: null } : ll) }));
                                        setGabOpenIdx(null);
                                      }} className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-100">
                                        Aucun format
                                      </button>
                                      {srGabs.map((g, gi) => (
                                        <button key={gi} type="button" onClick={() => {
                                          setForm(f => ({ ...f, lignes: f.lignes.map((ll, i) => i === idx ? { ...ll, gabarit_nom: g.nom, gabarit_poids_kg: g.poids_kg, quantite: 1 } : ll) }));
                                          setGabOpenIdx(null);
                                        }} className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 border-b border-gray-50 last:border-0 flex justify-between items-center">
                                          <span className="font-bold text-purple-700">{g.nom}</span>
                                          <span className="text-gray-400">{g.poids_kg >= 1 ? `${g.poids_kg}kg` : `${Math.round(g.poids_kg * 1000)}g`}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-1.5 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <input type="text" inputMode="decimal"
                              value={qtyInputs[idx] !== undefined ? qtyInputs[idx] : String(displayQty).replace('.', ',')}
                              onChange={e => {
                                const raw = e.target.value;
                                setQtyInputs(prev => ({ ...prev, [idx]: raw }));
                                const v = parseFloat(raw.replace(',', '.'));
                                if (!isNaN(v) && v > 0) updateQty(idx, isGab ? v : (srMode === 'dose' ? v * kgFiniParDose : v));
                              }}
                              onFocus={e => {
                                setQtyInputs(prev => ({ ...prev, [idx]: String(displayQty).replace('.', ',') }));
                                setTimeout(() => e.target.select(), 0);
                              }}
                              onBlur={() => setQtyInputs(prev => { const n = { ...prev }; delete n[idx]; return n; })}
                              className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
                            {isSR && <span className="text-[10px] text-gray-400 w-7">{isGab ? 'fond' : srMode === 'dose' ? 'dos.' : 'kg'}</span>}
                          </div>
                        </td>
                        <td className="py-1.5 text-right text-gray-400 text-xs hidden sm:table-cell">
                          {pmpDisplay > 0 ? (
                            <>{pmpDisplay.toFixed(3)}<span className="text-gray-300">{isGab ? '/fond' : srMode === 'dose' ? '/dos.' : isSR ? '/kg' : ''}</span></>
                          ) : '—'}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-gray-900 text-sm">{cout.toFixed(2)}</td>
                        <td className="py-1.5 text-right">
                          <span className={`text-xs font-bold ${pct > 35 ? 'text-orange-500' : 'text-gray-300'}`}>{pct.toFixed(0)}%</span>
                        </td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => removeLine(idx)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}

            {form.lignes.length > 0 && (() => {
              const totalKg = totalKgBrut;
              const perte = (form.pertePct || 0) / 100;
              const netKg = totalKg * (1 - perte) / (effectiveRendement || 1);
              const fmtKg = (v: number) => v >= 1
                ? v.toFixed(3).replace(/\.?0+$/, '') + ' kg'
                : Math.round(v * 1000) + ' g';
              return (
                <div className="flex items-center justify-end gap-4 px-1 py-1.5 border-t border-gray-100 mt-1">
                  <span className="text-xs text-gray-400">Poids brut <span className="font-semibold text-gray-500">{fmtKg(totalKg)}</span></span>
                  <span className="text-xs text-gray-400">Poids net <span className="text-sm font-black text-gray-700 tabular-nums">{fmtKg(netKg)}</span></span>
                </div>
              );
            })()}

            <div className="space-y-2">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
                <button onClick={() => setIngTab('mp')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${ingTab === 'mp' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  Matière première
                </button>
                {sousRecettes.filter(sr => sr.id !== recipe?.id).length > 0 && (
                  <button onClick={() => setIngTab('sr')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${ingTab === 'sr' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    Sous-recette
                  </button>
                )}
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={ingSearch} onChange={e => setIngSearch(e.target.value)}
                  placeholder={ingTab === 'mp' ? 'Rechercher une matière première…' : 'Filtrer les sous-recettes…'}
                  className="w-full pl-8 pr-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-solid" />
                {filteredItems.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg z-10">
                    {filteredItems.map((it: any) => {
                      const info = ingTab === 'mp'
                        ? (it.prix_moyen_pondere > 0 ? `${it.prix_moyen_pondere.toFixed(3)} MAD/${it.unite}` : 'Prix ND')
                        : `${calcSousRecetteParKg(it, sousRecettes).toFixed(2)} MAD/kg`;
                      return (
                        <button key={it.id} onClick={() => addLine(it, ingTab)}
                          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex justify-between items-center">
                          <span className="font-medium text-gray-800 text-sm">{it.nom}</span>
                          <span className="text-gray-400 text-xs">{info}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Allergènes (EU14)</span>
                <div className="flex flex-wrap gap-1.5 p-2.5 border border-gray-200 rounded-xl min-h-[100px]">
                  {ALLERGENES_EU.map(a => {
                    const active = form.allergenes.includes(a);
                    return (
                      <button key={a} type="button" onClick={() => toggleAllergene(a)}
                        className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${active ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-gray-500 border-gray-200 hover:border-yellow-300'}`}>
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400 font-semibold px-1">Notes internes</span>
              <textarea value={form.notes} onChange={e => S('notes', e.target.value)} rows={2}
                placeholder="Remarques, conseils de conservation…"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          {/* BLOC 3 — Planning de production */}
          <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Planning de production</p>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Délai fabr. (h)</span>
                <input type="number" min={0} step={1} value={form.delaiH || ''}
                  onChange={e => S('delaiH', parseInt(e.target.value) || 0)}
                  placeholder="Ex: 24"
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">DLC (heures)</span>
                <input type="number" min={0} step={1} value={form.dlcHeures || ''}
                  onChange={e => S('dlcHeures', parseInt(e.target.value) || 0)}
                  placeholder="Ex: 72"
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400 font-semibold px-1">Stock min (pcs)</span>
                <input type="number" min={0} step={1} value={form.stockMin || ''}
                  onChange={e => S('stockMin', parseInt(e.target.value) || 0)}
                  placeholder="Ex: 10"
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>
            <p className="text-xs text-gray-400 px-1">Le délai de fabrication permet au rétro-planning de calculer quand lancer la préparation. La DLC regroupe les commandes en fournées. Le stock min déclenche automatiquement une alerte de réapprovisionnement.</p>
          </div>

          {/* BLOC 3b — Gabarits (sous-recette uniquement) */}
          {type === 'sous_recette' && (
            <div className="border border-purple-100 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-black text-purple-400 uppercase tracking-wider">Gabarits / Formats</p>
              <p className="text-xs text-gray-400">Définit les tailles disponibles pour cette préparation. Ex : Ø8cm = 0,03 kg · Ø16cm = 0,15 kg</p>

              {localGabarits.length > 0 && (
                <div className="space-y-1.5">
                  {localGabarits.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-xl">
                      <span className="text-sm font-black text-purple-700 flex-1">{g.nom}</span>
                      <span className="text-sm text-purple-500 tabular-nums">{g.poids_kg >= 1 ? `${g.poids_kg} kg` : `${Math.round(g.poids_kg * 1000)} g`} / fond</span>
                      <button type="button" onClick={() => removeGabarit(i)}
                        className="text-purple-300 hover:text-red-500 transition-colors"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 items-end">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-xs text-gray-400 font-semibold px-1">Nom du format</span>
                  <input value={newGabNom} onChange={e => setNewGabNom(e.target.value)}
                    placeholder="Ex: Ø8cm, Ø16cm, Individuel…"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div className="flex flex-col gap-1 w-28">
                  <span className="text-xs text-gray-400 font-semibold px-1">Poids (kg)</span>
                  <input type="number" min={0.001} step={0.001} value={newGabPoids} onChange={e => setNewGabPoids(e.target.value)}
                    placeholder="0.030"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <button type="button" onClick={addGabarit}
                  disabled={!newGabNom.trim() || !parseFloat(newGabPoids)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-600 border border-purple-200 bg-purple-50 rounded-xl hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                  <Plus size={13} /> Ajouter
                </button>
              </div>
            </div>
          )}

          {/* BLOC 4 — Analyse économique */}
          <div className="border border-gray-100 rounded-2xl p-4 space-y-4">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Analyse économique</p>

            {type === 'sous_recette' ? (() => {
              const kgBrut = totalKgBrut;
              const kgNet = kgBrut * (1 - form.pertePct / 100) / (effectiveRendement || 1);
              const prixKg = kgNet > 0 ? coutUnitaire / kgNet : 0;
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <StatBox label="Coût brut" value={coutBrut.toFixed(2)} />
                  <StatBox label={`Poids net (−${form.pertePct}%)`} value={kgNet >= 1 ? `${kgNet.toFixed(3)} kg` : `${(kgNet * 1000).toFixed(0)} g`} />
                  <StatBox label="Coût/unité" value={coutUnitaire.toFixed(2)} />
                  <StatBox label="Prix/kg" value={prixKg > 0 ? prixKg.toFixed(2) : '—'} highlight />
                </div>
              );
            })() : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatBox label="Coût brut" value={coutBrut.toFixed(2)} />
                <StatBox label={`Perte ${form.pertePct}%`} value={(coutAvecPerte - coutBrut).toFixed(2)} />
                <StatBox label="Coût total" value={coutAvecPerte.toFixed(2)} />
                <StatBox label="Coût/unité" value={coutUnitaire.toFixed(2)} />
              </div>
            )}

            {/* Prix suggéré vs actuel — recettes uniquement */}
            {type === 'recette' && coutUnitaire > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-blue-500 font-semibold">Prix suggéré ({targetMarge}% marge)</p>
                  <p className="text-xl font-black text-blue-700">{suggestedUnitPrice.toFixed(2)} <span className="text-sm font-medium">MAD/u.</span></p>
                </div>
                {!form.produitId ? (
                  <div className={`rounded-xl px-4 py-3 space-y-1.5 ${form.prixCible > 0 ? (tauxMarge !== null && tauxMarge < 30 ? 'bg-red-50' : 'bg-green-50') : 'bg-gray-50'}`}>
                    <p className={`text-xs font-semibold ${form.prixCible > 0 ? (tauxMarge !== null && tauxMarge < 30 ? 'text-red-500' : 'text-green-600') : 'text-gray-400'}`}>
                      Votre prix de vente{tauxMarge !== null && form.prixCible > 0 ? ` · ${tauxMarge.toFixed(0)}% marge` : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} step={0.01}
                        value={form.prixCible || ''}
                        onChange={e => S('prixCible', parseFloat(e.target.value) || 0)}
                        placeholder={suggestedUnitPrice.toFixed(2)}
                        className="flex-1 bg-transparent text-xl font-black focus:outline-none w-20"
                        style={{ color: form.prixCible > 0 ? (tauxMarge !== null && tauxMarge < 30 ? '#dc2626' : '#15803d') : '#374151' }} />
                      <span className="text-sm font-medium text-gray-500">MAD/u.</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center">
                    <p className="text-xs text-gray-400">Saisissez le prix dans le tableau ci-dessous</p>
                  </div>
                )}
              </div>
            )}

            {/* Tableau tarifaire par format d'article */}
            {type === 'recette' && refArticles.length > 0 && coutUnitaire > 0 && (() => {
              const poidsKgBrut = totalKgBrut;
              const poidsKgNetParUnite = poidsKgBrut * (1 - form.pertePct / 100) / (effectiveRendement || 1);
              const fmtPoids = (kg: number) => kg >= 1
                ? kg.toFixed(3).replace(/\.?0+$/, '') + ' kg'
                : Math.round(kg * 1000) + ' g';
              return (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tarification par format</p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm min-w-[400px] sm:min-w-[560px]">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-400 font-semibold">
                          <th className="text-left px-3 py-2">Article</th>
                          <th className="text-right px-3 py-2">Poids net</th>
                          <th className="text-right px-3 py-2">Coût lot</th>
                          <th className="text-right px-3 py-2">Prix vente</th>
                          <th className="text-right px-3 py-2">Marge</th>
                          <th className="text-right px-3 py-2 text-blue-500">Cible {targetMarge}%</th>
                          <th className="text-right px-3 py-2 text-orange-500">DLC (j)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refArticles.map(art => {
                          const costLot = coutUnitaire * art.quantity;
                          const poidsArt = poidsKgNetParUnite * art.quantity;
                          const prixActuel = art.prix_pro ?? art.prix_particulier ?? art.custom_price ?? ((selectedRef?.base_unit_price ?? 0) > 0 ? (selectedRef!.base_unit_price * art.quantity) : null);
                          const margeArt = prixActuel !== null && prixActuel > 0 ? ((prixActuel - costLot) / prixActuel) * 100 : null;
                          const prixCible = suggestedUnitPrice * art.quantity;
                          const ecart = prixActuel !== null && prixActuel > 0 ? prixCible - prixActuel : null;
                          return (
                            <tr key={art.id} className="border-t border-gray-50 hover:bg-gray-50">
                              <td className="px-3 py-2.5 font-medium text-gray-800">{art.display_name}</td>
                              <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                                {poidsArt > 0 ? fmtPoids(poidsArt) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-gray-500">{costLot.toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right text-gray-700">
                                {prixActuel !== null && prixActuel > 0 ? prixActuel.toFixed(2) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className={`px-3 py-2.5 text-right font-bold ${margeColor(margeArt)}`}>
                                {margeArt !== null ? `${margeArt.toFixed(0)}%` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="font-bold text-blue-600">{prixCible.toFixed(2)}</span>
                                {ecart !== null && Math.abs(ecart) > 0.01 && (
                                  <span className={`ml-1 text-xs ${ecart > 0 ? 'text-orange-500' : 'text-green-500'}`}>
                                    {ecart > 0 ? `+${ecart.toFixed(2)}` : ecart.toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {editingDlc === art.id ? (
                                  <input autoFocus type="number" min={1}
                                    defaultValue={getArticleDlc(art)}
                                    onBlur={e => saveArticleDlc(art.id, parseInt(e.target.value) || 3)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveArticleDlc(art.id, parseInt((e.target as HTMLInputElement).value) || 3);
                                      if (e.key === 'Escape') setEditingDlc(null);
                                    }}
                                    className="w-14 text-right px-1 py-0.5 border-2 border-orange-400 rounded-lg text-xs font-bold focus:outline-none" />
                                ) : (
                                  <button onClick={() => setEditingDlc(art.id)}
                                    className="font-bold text-orange-500 hover:text-orange-700 tabular-nums text-right w-full">
                                    {getArticleDlc(art)}j
                                    {articleDlcOverrides[art.id] != null && <span className="text-[10px] text-orange-300 ml-0.5">✎</span>}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400 text-center">Poids net = ingrédients × (1-perte) / rendement × quantité article</p>
                </div>
              );
            })()}

            {type === 'recette' && !form.produitId && (
              <p className="text-xs text-gray-400 text-center py-1">Sélectionnez une référence pour voir l'analyse tarifaire par format</p>
            )}
            {type === 'sous_recette' && (
              <p className="text-xs text-gray-400 text-center py-1">Coût de revient interne · Non vendue directement</p>
            )}
          </div>

          </> /* fin step 1 */}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RecettesPage() {
  const { ateliers, getStyle } = useAteliers();
  const [tab, setTab] = useState<'recette' | 'sous_recette'>('recette');
  const [allSheets, setAllSheets] = useState<RecipeSheet[]>([]);
  const [stockItems, setStockItems] = useState<StockItemLight[]>([]);
  const [productReferences, setProductReferences] = useState<ProductReferenceLight[]>([]);
  const [dbCategories, setDbCategories] = useState<{ nom: string; atelier: string; pour?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMarge, setFilterMarge] = useState<'all' | 'alerte' | 'bonne'>('all');
  const [modalRecipe, setModalRecipe] = useState<RecipeSheet | null | 'new'>('new' as any);
  const [modalOpen, setModalOpen] = useState(false);
  const [catalogueModal, setCatalogueModal] = useState<RecipeSheet | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [calculateurRecipe, setCalculateurRecipe] = useState<RecipeSheet | null>(null);
  const [filterAtelier, setFilterAtelier] = useState<string | null>(null);
  const [filterCategorie, setFilterCategorie] = useState<string | null>(null);
  const [quickViewRecipe, setQuickViewRecipe] = useState<RecipeSheet | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const recettes = allSheets.filter(s => s.type !== 'sous_recette');
  const sousRecettes = allSheets.filter(s => s.type === 'sous_recette');

  const refsSansRecette = useMemo(() => {
    const linked = new Set(allSheets.filter(s => s.product_reference_id).map(s => s.product_reference_id));
    return productReferences.filter(r => !linked.has(r.id)).length;
  }, [allSheets, productReferences]);

  // Calculs de coût pré-calculés une seule fois pour tous les affichages
  const costMap = useMemo(() => {
    const map = new Map<string, { coutUnitaire: number; coutAvecPerte: number; pv: number | null; tauxMarge: number | null }>();
    for (const r of allSheets) {
      const { coutUnitaire, coutAvecPerte } = calcLignes(r.ingredients || [], sousRecettes, r.perte_pct || 0, r.rendement, r.type === 'recette');
      const ref = productReferences.find(p => p.id === r.product_reference_id);
      const pv = getPrixVenteUnitaire(ref);
      const tauxMarge = pv && pv > 0 ? ((pv - coutUnitaire) / pv) * 100 : null;
      map.set(r.id, { coutUnitaire, coutAvecPerte, pv, tauxMarge });
    }
    return map;
  }, [allSheets, sousRecettes, productReferences]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [sheetsRes, itemsRes, refsRes, catsRes] = await Promise.all([
      supabase.from('recipe_sheets').select(`
        *,
        gabarits:recipe_sheet_gabarits(id, nom, poids_kg),
        ingredients:recipe_ingredients!recipe_sheet_id(*, stock_item:stock_items(id, nom, unite, prix_moyen_pondere, poids_unitaire_g)),
        product_reference:product_references(id, name, base_unit_price)
      `).order('nom'),
      supabase.from('stock_items').select('id, nom, unite, prix_moyen_pondere').order('nom'),
      supabase.from('product_references').select('id, name, base_unit_price, articles:product_articles(quantity, prix_pro, prix_particulier, custom_price)').eq('is_active', true).order('name'),
      supabase.from('categories').select('nom, atelier, pour').order('ordre'),
    ]);

    if (sheetsRes.error) console.error('Erreur chargement recettes:', sheetsRes.error.message);
    if (itemsRes.error) console.error('Erreur chargement stock:', itemsRes.error.message);
    if (refsRes.error) console.error('Erreur chargement références:', refsRes.error.message);

    const { data: sheets } = sheetsRes;
    const { data: items } = itemsRes;
    const { data: refs } = refsRes;

    // Peupler les objets sous_recipe depuis les sheets déjà chargés
    const sheetsRaw = (sheets as RecipeSheet[]) || [];
    const sheetsWithSR = sheetsRaw.map(sheet => ({
      ...sheet,
      ingredients: (sheet.ingredients || []).map(ing => ({
        ...ing,
        sous_recipe: ing.sous_recipe_id ? sheetsRaw.find(s => s.id === ing.sous_recipe_id) || null : null,
      })),
    }));

    setAllSheets(sheetsWithSR);
    setStockItems(items || []);
    setProductReferences((refs as ProductReferenceLight[]) || []);
    setDbCategories((catsRes.data || []) as { nom: string; atelier: string; pour?: string | null }[]);
    setLoading(false);
  }

  async function deleteRecipe(id: string) {
    if (!confirm('Supprimer cette recette ?')) return;
    await supabase.from('recipe_sheets').delete().eq('id', id);
    setAllSheets(p => p.filter(r => r.id !== id));
  }

  async function duplicateRecipe(recipe: RecipeSheet) {
    const nom = `Copie de ${recipe.nom}`;
    const { data: newSheet, error: sheetErr } = await supabase.from('recipe_sheets').insert({
      nom, type: recipe.type, rendement: recipe.rendement, perte_pct: recipe.perte_pct,
      procede: recipe.procede, atelier: recipe.atelier, categorie: recipe.categorie,
      allergenes: recipe.allergenes, poids_portion_g: recipe.poids_portion_g, notes: recipe.notes,
      prix_cible: recipe.prix_cible,
      // Pas de product_reference_id — lien 1:1 avec la recette d'origine
    }).select('id').single();
    if (sheetErr || !newSheet) { alert('Erreur duplication : ' + sheetErr?.message); return; }
    const ingredients = (recipe.ingredients || []).filter(i => i.stock_item_id || i.sous_recipe_id);
    if (ingredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(ingredients.map(i => ({
        recipe_sheet_id: newSheet.id, stock_item_id: i.stock_item_id || null,
        sous_recipe_id: i.sous_recipe_id || null, quantite: i.quantite,
      })));
    }
    await load();
  }

  function openNew() {
    setModalRecipe(null);
    setModalOpen(true);
  }

  function openEdit(recipe: RecipeSheet) {
    setModalRecipe(recipe);
    setModalOpen(true);
  }

  const displayed = (tab === 'recette' ? recettes : sousRecettes).filter(r => {
    const matchSearch = r.nom.toLowerCase().includes(search.toLowerCase())
      || (r.atelier ?? '').toLowerCase().includes(search.toLowerCase());
    const matchAtelier = !filterAtelier || r.atelier === filterAtelier;
    const matchCategorie = !filterCategorie || r.categorie === filterCategorie;
    if (tab === 'sous_recette') return matchSearch && matchAtelier && matchCategorie;
    const { tauxMarge } = costMap.get(r.id) ?? { tauxMarge: null };
    const matchMarge = filterMarge === 'all' ? true
      : filterMarge === 'alerte' ? (tauxMarge === null || tauxMarge < 30)
      : tauxMarge !== null && tauxMarge >= 30;
    return matchSearch && matchAtelier && matchCategorie && matchMarge;
  });

  const alerteCount = recettes.filter(r => {
    const { tauxMarge } = costMap.get(r.id) ?? { tauxMarge: null };
    return tauxMarge === null || tauxMarge < 30;
  }).length;

  const avgMarge = recettes.length > 0 ? Math.round(recettes.reduce((s, r) => {
    const { tauxMarge } = costMap.get(r.id) ?? { tauxMarge: null };
    return s + (tauxMarge ?? 0);
  }, 0) / recettes.length) : 0;

  // Filtres ateliers/catégories — partagés mobile + desktop
  const tabSource = tab === 'recette' ? recettes : sousRecettes;
  const usedAteliers = ateliers.filter(a => tabSource.some(r => r.atelier === a.value));
  const tabPour = tab === 'recette' ? 'recette' : 'sous_recette';
  const availableCatNames = filterAtelier
    ? dbCategories.filter(c => (!c.pour || c.pour === tabPour) && (!c.atelier || c.atelier === filterAtelier)).map(c => c.nom)
    : dbCategories.filter(c => !c.pour || c.pour === tabPour).map(c => c.nom);
  const usedCategories = [...new Set(
    tabSource.filter(r => (!filterAtelier || r.atelier === filterAtelier) && r.categorie && availableCatNames.includes(r.categorie)).map(r => r.categorie!)
  )].sort((a, b) => a.localeCompare(b));

  return (
    <>
      {/* Fiche rapide mobile */}
      {quickViewRecipe && (
        <QuickRecipeSheet
          recipe={quickViewRecipe}
          sousRecettes={sousRecettes}
          costEntry={costMap.get(quickViewRecipe.id) ?? { coutUnitaire: 0, coutAvecPerte: 0, pv: null, tauxMarge: null }}
          getStyle={getStyle}
          onEdit={() => { openEdit(quickViewRecipe); setQuickViewRecipe(null); }}
          onClose={() => setQuickViewRecipe(null)}
        />
      )}

      {/* Modals partagées mobile + desktop */}
      {calculateurRecipe && (
        <CalculateurModal
          recipe={calculateurRecipe}
          sousRecettes={sousRecettes}
          onClose={() => setCalculateurRecipe(null)}
        />
      )}

      {/* Modal catalogue */}
      {catalogueModal && (
        <AddToCatalogueModal
          recipe={catalogueModal}
          coutUnitaire={calcLignes(catalogueModal.ingredients || [], sousRecettes, catalogueModal.perte_pct || 0, catalogueModal.rendement).coutUnitaire}
          ateliers={ateliers}
          onClose={() => setCatalogueModal(null)}
          onSaved={load}
        />
      )}

      {/* Modal recette */}
      {modalOpen && (
        <RecipeModal
          recipe={modalRecipe as RecipeSheet | null}
          type={tab}
          stockItems={stockItems}
          sousRecettes={sousRecettes}
          productReferences={productReferences}
          ateliers={ateliers}
          categories={dbCategories}
          onClose={() => setModalOpen(false)}
          onSaved={load}
        />
      )}

      {/* ─── VERSION MOBILE ─────────────────────────────── */}
      <div className="lg:hidden -mx-4 -mt-4">
        {/* Sticky sub-header */}
        <div className="sticky top-14 z-20 bg-gray-50 border-b border-gray-100 px-4 pt-3 pb-2 space-y-2">
          {/* Tabs + bouton nouveau */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1 p-1 bg-gray-200/70 rounded-xl">
              <button onClick={() => { setTab('recette'); setSearch(''); setFilterAtelier(null); setFilterCategorie(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'recette' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                Recettes
              </button>
              <button onClick={() => { setTab('sous_recette'); setSearch(''); setFilterAtelier(null); setFilterCategorie(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'sous_recette' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                Sous-recettes
                {sousRecettes.length > 0 && <span className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{sousRecettes.length}</span>}
              </button>
            </div>
            <button onClick={openNew} className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shrink-0 active:bg-blue-700">
              <Plus size={18} />
            </button>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Ateliers (scroll horizontal) */}
          {usedAteliers.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              <button onClick={() => { setFilterAtelier(null); setFilterCategorie(null); }}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${!filterAtelier ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                Tous
              </button>
              {usedAteliers.map(a => (
                <button key={a.value} onClick={() => { setFilterAtelier(a.value); setFilterCategorie(null); }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterAtelier === a.value ? 'text-white' : 'bg-white border border-gray-200 text-gray-700'}`}
                  style={filterAtelier === a.value ? { backgroundColor: a.color, borderColor: a.color } : {}}>
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* Catégories (scroll horizontal) */}
          {usedCategories.length > 0 && filterAtelier && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              <button onClick={() => setFilterCategorie(null)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!filterCategorie ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600'}`}>
                Toutes
              </button>
              {usedCategories.map(cat => (
                <button key={cat} onClick={() => setFilterCategorie(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterCategorie === cat ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600'}`}>
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Liste recettes */}
        <div className="px-4 pt-3 space-y-2">
          {loading && displayed.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-12">
              <ChefHat size={36} className="mx-auto text-gray-200 mb-2" />
              <p className="text-gray-400 text-sm font-medium">Aucune {tab === 'recette' ? 'recette' : 'sous-recette'}</p>
            </div>
          ) : (
            displayed.map(recipe => {
              const { coutUnitaire, pv, tauxMarge } = costMap.get(recipe.id) ?? { coutUnitaire: 0, pv: null, tauxMarge: null };
              const atelierStyle = recipe.atelier ? getStyle(recipe.atelier) : null;
              const isSel = selectedIds.has(recipe.id);
              return (
                <div key={recipe.id} className={`flex items-stretch bg-white rounded-2xl border transition-colors ${isSel ? 'border-green-400 ring-1 ring-green-200' : 'border-gray-100'}`}>
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(recipe.id)}
                    className={`flex-shrink-0 w-10 flex items-center justify-center rounded-l-2xl transition-colors ${isSel ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    <span className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-colors ${isSel ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                      {isSel && <Check size={11} className="text-white" />}
                    </span>
                  </button>
                  {/* Contenu */}
                  <button onClick={() => setQuickViewRecipe(recipe)}
                    className="flex-1 px-3 py-3.5 text-left active:bg-gray-50 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-gray-900 flex-1 leading-snug">{recipe.nom}</p>
                      {recipe.type === 'recette' && <MargeBadge pct={tauxMarge} />}
                      {recipe.type === 'sous_recette' && (() => {
                        const poidsKg = calcPoidsKg(recipe.ingredients || [], sousRecettes);
                        const perte = (recipe.perte_pct || 0) / 100;
                        const kgNet = poidsKg * (1 - perte) / (recipe.rendement || 1);
                        const prixKg = kgNet > 0 ? coutUnitaire / kgNet : null;
                        return prixKg !== null ? (
                          <span className="text-xs font-bold text-blue-600 shrink-0">{prixKg.toFixed(2)}<span className="font-normal text-gray-400">/kg</span></span>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {atelierStyle && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ color: atelierStyle.color, backgroundColor: atelierStyle.bgColor }}>
                          {atelierStyle.label}
                        </span>
                      )}
                      {recipe.categorie && (
                        <span className="text-[11px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">{recipe.categorie}</span>
                      )}
                      {(recipe.allergenes || []).length > 0 && (
                        <span className="text-[11px] px-2 py-0.5 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded-full">⚠ {recipe.allergenes!.length}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>Coût <strong className="text-gray-700">{coutUnitaire.toFixed(2)} MAD</strong></span>
                      {pv !== null && <span>· Vente <strong className="text-gray-700">{pv.toFixed(2)} MAD</strong></span>}
                      <span>· {recipe.rendement} {recipe.unite || 'u.'}</span>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── VERSION DESKTOP ────────────────────────────── */}
      <div className="hidden lg:block space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fiches recettes</h1>
          <p className="text-sm text-gray-400">
            {recettes.length} recette{recettes.length > 1 ? 's' : ''} · {sousRecettes.length} sous-recette{sousRecettes.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
          <Link href="/recettes/planning"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
            <CalendarDays size={15} /> <span className="hidden sm:inline">Planning</span><span className="sm:hidden">Plan</span>
          </Link>
          <Link href="/recettes/fp"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
            <FileText size={15} /> <span className="hidden sm:inline">Fiches de Prod</span><span className="sm:hidden">FP</span>
          </Link>
          <Link href="/recettes/catalogue"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
            <BookOpen size={15} /> <span className="hidden sm:inline">Catalogue coûté</span><span className="sm:hidden">Catalogue</span>
          </Link>
          <button onClick={openNew}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={15} /> Nouvelle
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-gray-900">{recettes.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Recettes</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-green-600">{avgMarge}%</p>
          <p className="text-xs text-gray-400 mt-0.5">Marge moy.</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-red-600">{alerteCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">En alerte</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${refsSansRecette > 0 ? 'bg-orange-50 border-orange-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-black ${refsSansRecette > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{refsSansRecette}</p>
          <p className="text-xs text-gray-400 mt-0.5">Sans recette</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit">
        <button onClick={() => { setTab('recette'); setSearch(''); setFilterAtelier(null); setFilterCategorie(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'recette' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Recettes
        </button>
        <button onClick={() => { setTab('sous_recette'); setSearch(''); setFilterAtelier(null); setFilterCategorie(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'sous_recette' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Sous-recettes
          {sousRecettes.length > 0 && <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{sousRecettes.length}</span>}
        </button>
      </div>

      {/* Filtres atelier + catégorie */}
      {usedAteliers.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setFilterAtelier(null); setFilterCategorie(null); }}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${!filterAtelier ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              Tous
            </button>
            {usedAteliers.map(a => (
              <button key={a.value}
                onClick={() => { setFilterAtelier(a.value); setFilterCategorie(null); }}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${filterAtelier === a.value ? 'text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                style={filterAtelier === a.value ? { backgroundColor: a.color, borderColor: a.color } : {}}>
                {a.label}
              </button>
            ))}
          </div>
          {usedCategories.length > 0 && filterAtelier && (
            <div className="flex gap-2 flex-wrap pl-1">
              <button
                onClick={() => setFilterCategorie(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${!filterCategorie ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                Toutes
              </button>
              {usedCategories.map(cat => (
                <button key={cat}
                  onClick={() => setFilterCategorie(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${filterCategorie === cat ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recherche + filtres */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
            <LayoutList size={16} />
          </button>
          <button onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
            <Table2 size={16} />
          </button>
        </div>
      </div>
      {tab === 'recette' && (
        <div className="flex gap-2 flex-wrap">
          {([
            { v: 'all', l: 'Toutes' },
            { v: 'alerte', l: alerteCount > 0 ? `Alerte (${alerteCount})` : 'Alerte' },
            { v: 'bonne', l: 'Bonne marge' },
          ] as const).map(f => (
            <button key={f.v} onClick={() => setFilterMarge(f.v)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterMarge === f.v ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {f.l}
            </button>
          ))}
        </div>
      )}

      {/* Liste */}
      {loading && allSheets.length === 0 ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <ChefHat className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucune {tab === 'recette' ? 'recette' : 'sous-recette'}</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[320px] sm:min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Atelier</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Rendement</th>
                <th className="text-right px-4 py-3">Coût/u.</th>
                {tab === 'recette' && <th className="text-right px-4 py-3 hidden sm:table-cell">Prix vente</th>}
                {tab === 'recette' && <th className="text-right px-4 py-3">Marge</th>}
                {tab === 'recette' && <th className="text-right px-4 py-3 hidden md:table-cell">Food cost</th>}
                <th className="text-right px-4 py-3 hidden sm:table-cell">Ingr.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayed.map(recipe => {
                const { coutUnitaire, pv, tauxMarge } = costMap.get(recipe.id) ?? { coutUnitaire: 0, pv: null, tauxMarge: null };
                return (
                  <tr key={recipe.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{recipe.nom}</span>
                        {recipe.categorie && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">{recipe.categorie}</span>}
                        {tab === 'recette' && tauxMarge !== null && tauxMarge < 30 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Alerte</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{recipe.atelier || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">
                      {recipe.rendement} {recipe.unite || 'u.'}
                      {recipe.poids_portion_g ? <span className="text-xs text-gray-400 ml-1">· {recipe.poids_portion_g}g</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{coutUnitaire.toFixed(2)}</td>
                    {tab === 'recette' && <td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">{pv !== null ? pv.toFixed(2) : '—'}</td>}
                    {tab === 'recette' && (
                      <td className={`px-4 py-3 text-right font-bold ${margeColor(tauxMarge)}`}>
                        {tauxMarge !== null ? `${tauxMarge.toFixed(0)}%` : '—'}
                      </td>
                    )}
                    {tab === 'recette' && (() => {
                      const fc = pv && pv > 0 ? (coutUnitaire / pv) * 100 : null;
                      const fcColor = fc === null ? 'text-gray-400' : fc >= 30 ? 'text-red-600' : fc >= 25 ? 'text-orange-500' : 'text-green-600';
                      return (
                        <td className={`px-4 py-3 text-right font-bold hidden md:table-cell ${fcColor}`}>
                          {fc !== null ? `${fc.toFixed(0)}%` : '—'}
                        </td>
                      );
                    })()}
                    <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">{(recipe.ingredients || []).length}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/recettes/${recipe.id}/fiche`}
                          className="p-1 text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors" title="Fiche recette">
                          <FileText size={13} />
                        </Link>
                        {tab === 'recette' && !recipe.product_reference_id && (
                          <button onClick={() => setCatalogueModal(recipe)}
                            className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Ajouter au catalogue">
                            <ShoppingBag size={13} />
                          </button>
                        )}
                        <button onClick={() => setCalculateurRecipe(recipe)}
                          className="p-1 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Calculateur de fournée">
                          <Calculator size={13} />
                        </button>
                        <button onClick={() => duplicateRecipe(recipe)}
                          className="p-1 text-gray-300 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-colors" title="Dupliquer">
                          <RotateCcw size={13} />
                        </button>
                        <button onClick={() => openEdit(recipe)}
                          className="px-2.5 py-1 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                          Modifier
                        </button>
                        <button onClick={() => deleteRecipe(recipe.id)}
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(recipe => {
            const { coutUnitaire, coutAvecPerte, pv, tauxMarge } = costMap.get(recipe.id) ?? { coutUnitaire: 0, coutAvecPerte: 0, pv: null, tauxMarge: null };
            const marge = pv !== null ? pv - coutUnitaire : null;
            const open = expandedId === recipe.id;

            const isSelected = selectedIds.has(recipe.id);
            return (
              <div key={recipe.id} className={`bg-white rounded-2xl border overflow-hidden transition-colors ${isSelected ? 'border-green-400 ring-1 ring-green-200' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleSelect(recipe.id)}
                    className={`flex-shrink-0 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
                    {isSelected && <Check size={11} className="text-white" />}
                  </button>
                  <button onClick={() => setExpandedId(open ? null : recipe.id)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{recipe.nom}</p>
                      {recipe.atelier && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{recipe.atelier}</span>}
                      {recipe.categorie && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full">{recipe.categorie}</span>}
                      {recipe.type === 'recette' && <MargeBadge pct={tauxMarge} />}
                      {(recipe.allergenes || []).length > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full">
                          ⚠ {recipe.allergenes!.length} allergène{recipe.allergenes!.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span>Coût/unité : <strong className="text-gray-700">{coutUnitaire.toFixed(2)} MAD</strong></span>
                      {pv !== null && <span>Vente : <strong className="text-gray-700">{pv.toFixed(2)} MAD</strong></span>}
                      {marge !== null && <span className={`font-semibold ${margeColor(tauxMarge)}`}>+{marge.toFixed(2)} MAD</span>}
                      <span>
                        {recipe.rendement} {recipe.unite || 'u.'}
                        {recipe.poids_portion_g ? ` · ${recipe.poids_portion_g}g/pcs` : ''}
                        {' · '}Perte {recipe.perte_pct || 0}%
                      </span>
                      <span>{(recipe.ingredients || []).length} ingrédient{(recipe.ingredients || []).length > 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/recettes/${recipe.id}/fiche`}
                      className="p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors" title="Fiche recette">
                      <FileText size={15} />
                    </Link>
                    {tab === 'recette' && !recipe.product_reference_id && (
                      <button onClick={() => setCatalogueModal(recipe)}
                        className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors" title="Ajouter au catalogue">
                        <ShoppingBag size={15} />
                      </button>
                    )}
                    <button onClick={() => setCalculateurRecipe(recipe)}
                      className="p-1.5 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors" title="Calculateur de fournée">
                      <Calculator size={15} />
                    </button>
                    <button onClick={() => duplicateRecipe(recipe)}
                      className="p-1.5 text-gray-300 hover:text-purple-500 hover:bg-purple-50 rounded-xl transition-colors" title="Dupliquer">
                      <RotateCcw size={15} />
                    </button>
                    <button onClick={() => openEdit(recipe)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                      Modifier
                    </button>
                    <button onClick={() => deleteRecipe(recipe.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                      <Trash2 size={15} />
                    </button>
                    <button onClick={() => setExpandedId(open ? null : recipe.id)} className="p-1.5 text-gray-400">
                      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Aperçu rapide des ingrédients */}
                {open && (
                  <div className="border-t border-gray-50 px-4 pb-3 pt-2 space-y-2">
                    {recipe.procede && (
                      <p className="text-xs text-gray-500 italic bg-gray-50 rounded-xl px-3 py-2">"{recipe.procede.slice(0, 200)}{recipe.procede.length > 200 ? '…' : ''}"</p>
                    )}
                    {(recipe.ingredients || []).length > 0 ? (
                      <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {(recipe.ingredients || []).map((ing, i) => {
                            const isSR = !!ing.sous_recipe_id;
                            const pmp = isSR
                              ? (ing.sous_recipe ? calcSousRecetteParKg(ing.sous_recipe, sousRecettes) : 0)
                              : (ing.stock_item?.prix_moyen_pondere || 0);
                            return (
                              <tr key={i} className="border-t border-gray-50">
                                <td className="py-1.5 text-gray-700 flex items-center gap-1.5">
                                  {isSR && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-bold">SR</span>}
                                  {isSR ? ing.sous_recipe?.nom : ing.stock_item?.nom}
                                  {!isSR && ing.stock_item && <span className="text-gray-400 text-xs">({ing.stock_item.unite})</span>}
                                </td>
                                <td className="py-1.5 text-right text-gray-500">{ing.quantite}</td>
                                <td className="py-1.5 text-right font-semibold text-gray-900">{(ing.quantite * pmp).toFixed(2)} MAD</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-2">Aucun ingrédient — cliquez sur Modifier</p>
                    )}
                    {/* Mini récap */}
                    <div className={`grid gap-2 pt-1 ${recipe.type === 'sous_recette' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
                      <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <p className="text-xs text-gray-400">Coût total</p>
                        <p className="text-sm font-bold text-gray-800">{coutAvecPerte.toFixed(2)} MAD</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <p className="text-xs text-gray-400">Par unité</p>
                        <p className="text-sm font-bold text-gray-800">{coutUnitaire.toFixed(2)} MAD</p>
                      </div>
                      {recipe.type === 'sous_recette' ? (() => {
                        const poidsKgBrut = calcPoidsKg(recipe.ingredients || [], sousRecettes);
                        const perte = (recipe.perte_pct || 0) / 100;
                        const poidsKgNet = poidsKgBrut * (1 - perte) / (recipe.rendement || 1);
                        const prixKg = poidsKgNet > 0 && coutAvecPerte > 0 ? coutUnitaire / poidsKgNet : null;
                        const hasUnknown = (recipe.ingredients || []).some(ing => {
                          if (!ing.stock_item_id || !ing.stock_item) return false;
                          const key = (ing.stock_item.unite || '').toLowerCase().trim();
                          return !GRAM_FACTORS[key] && !ing.stock_item.poids_unitaire_g;
                        });
                        const poidsLabel = poidsKgNet >= 1
                          ? `${poidsKgNet.toFixed(3).replace(/\.?0+$/, '')} kg`
                          : `${Math.round(poidsKgNet * 1000)} g`;
                        return (
                          <>
                            <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                              <p className="text-xs text-gray-400">Poids net</p>
                              <p className="text-sm font-bold text-gray-800">
                                {poidsKgNet > 0 ? poidsLabel : '—'}
                                {hasUnknown && poidsKgNet > 0 && <span className="block text-[10px] text-orange-400 font-normal">partiel</span>}
                              </p>
                            </div>
                            <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                              <p className="text-xs text-gray-400">Prix/kg</p>
                              {prixKg !== null ? (
                                <p className="text-sm font-bold text-gray-800">
                                  {hasUnknown ? '~' : ''}{prixKg.toFixed(2)} MAD
                                </p>
                              ) : (
                                <p className="text-sm font-bold text-gray-400">—</p>
                              )}
                            </div>
                          </>
                        );
                      })() : (
                        <div className={`rounded-xl px-3 py-2 text-center ${tauxMarge !== null ? (tauxMarge >= 30 ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                          <p className="text-xs text-gray-400">Marge</p>
                          <p className={`text-sm font-bold ${margeColor(tauxMarge)}`}>
                            {tauxMarge !== null ? `${tauxMarge.toFixed(0)}%` : '—'}
                          </p>
                        </div>
                      )}
                    </div>
                    {/* Qui utilise cette sous-recette */}
                    {recipe.type === 'sous_recette' && (() => {
                      const usedBy = recettes.filter(r => (r.ingredients || []).some(ing => ing.sous_recipe_id === recipe.id));
                      if (usedBy.length === 0) return null;
                      return (
                        <div className="bg-indigo-50 rounded-xl px-3 py-2">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-1">Utilisée dans</p>
                          <div className="flex flex-wrap gap-1.5">
                            {usedBy.map(r => (
                              <span key={r.id} className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">{r.nom}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex justify-end">
                      <button onClick={() => deleteRecipe(recipe.id)} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                        <Trash2 size={11} /> Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>{/* fin hidden lg:block */}

      {/* ─── Barre flottante export multiple ─────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-2xl shadow-2xl">
          <span className="text-sm font-semibold">{selectedIds.size} recette{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
          <button
            onClick={() => { window.location.href = `/api/recettes/export-excel?ids=${[...selectedIds].join(',')}`; }}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-500 hover:bg-green-400 text-white rounded-xl text-sm font-semibold transition-colors">
            <FileSpreadsheet size={15} /> Exporter Excel
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
