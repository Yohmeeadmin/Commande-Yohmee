'use client';

import { useState } from 'react';
import { X, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types locaux (miroir de page.tsx) ───────────────────────────────────────

interface StockItemLight {
  id: string; nom: string; unite: string;
  prix_moyen_pondere: number; poids_unitaire_g?: number | null;
}

interface IngredientLine {
  stock_item_id?: string | null;
  sous_recipe_id?: string | null;
  quantite: number;
  gabarit_nom?: string | null;
  gabarit_poids_kg?: number | null;
  stock_item?: StockItemLight | null;
  sous_recipe?: RecipeSheet | null;
}

interface RecipeSheet {
  id: string; nom: string;
  type: 'recette' | 'sous_recette';
  rendement: number; perte_pct: number;
  atelier: string | null; categorie: string | null;
  unite: string | null; poids_portion_g: number | null;
  procede: string | null;
  ingredients?: IngredientLine[];
}

interface CostEntry {
  coutUnitaire: number; coutAvecPerte: number;
  pv: number | null; tauxMarge: number | null;
}

interface AtelierStyle {
  label: string; color: string; bgColor: string;
}

interface Props {
  recipe: RecipeSheet;
  sousRecettes: RecipeSheet[];
  costEntry: CostEntry;
  getStyle: (value: string) => AtelierStyle;
  onEdit: () => void;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GRAM_FACTORS: Record<string, number> = {
  kg: 1000, g: 1, mg: 0.001,
  l: 1000, litre: 1000, litres: 1000, cl: 10, ml: 1,
};

function formatQte(quantite: number, unite: string): string {
  const u = unite.toLowerCase().trim();
  if (u === 'kg') {
    const g = quantite * 1000;
    return g >= 1000 ? `${(g / 1000).toFixed(2).replace(/\.?0+$/, '')} kg` : `${Math.round(g)} g`;
  }
  if (u === 'g') {
    return quantite >= 1000 ? `${(quantite / 1000).toFixed(2).replace(/\.?0+$/, '')} kg` : `${Math.round(quantite)} g`;
  }
  if (u === 'l' || u === 'litre' || u === 'litres') {
    const ml = quantite * 1000;
    return ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(ml)} mL`;
  }
  if (u === 'cl') {
    const ml = quantite * 10;
    return ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(ml)} mL`;
  }
  if (u === 'ml') {
    return quantite >= 1000 ? `${(quantite / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(quantite)} mL`;
  }
  return `${Math.round(quantite * 100) / 100} ${unite}`;
}

function calcSRCostPerKg(sr: RecipeSheet, allSR: RecipeSheet[]): number {
  const coutBrut = (sr.ingredients || []).reduce((s, ing) => {
    if (ing.stock_item_id && ing.stock_item) return s + ing.quantite * ing.stock_item.prix_moyen_pondere;
    if (ing.sous_recipe_id) {
      const nested = allSR.find(x => x.id === ing.sous_recipe_id);
      if (nested) return s + ing.quantite * calcSRCostPerKg(nested, allSR);
    }
    return s;
  }, 0);
  const kgTotal = (sr.ingredients || []).reduce((sum, l) => {
    if (l.stock_item_id && l.stock_item) {
      const key = l.stock_item.unite.toLowerCase().trim();
      const factor = GRAM_FACTORS[key];
      if (factor) return sum + l.quantite * factor / 1000;
      if (l.stock_item.poids_unitaire_g) return sum + l.quantite * l.stock_item.poids_unitaire_g / 1000;
    }
    return sum;
  }, 0);
  const costPerUnit = coutBrut / (sr.rendement || 1);
  const perte = (sr.perte_pct || 0) / 100;
  const kgNet = kgTotal * (1 - perte) / (sr.rendement || 1);
  return kgNet > 0 ? costPerUnit / kgNet : costPerUnit;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function QuickRecipeSheet({ recipe, sousRecettes, costEntry, getStyle, onEdit, onClose }: Props) {
  const [qty, setQty] = useState(1); // nombre de fournées
  const [procOpen, setProcOpen] = useState(false);

  const factor = qty; // ingrédients × factor
  const atelierStyle = recipe.atelier ? getStyle(recipe.atelier) : null;

  const totalUnits = recipe.rendement * qty;
  const totalCout = costEntry.coutAvecPerte * qty;

  const ingredients = recipe.ingredients || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:p-4 sm:items-center"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-1 pb-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900 text-lg leading-tight">{recipe.nom}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {atelierStyle && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ color: atelierStyle.color, backgroundColor: atelierStyle.bgColor }}>
                  {atelierStyle.label}
                </span>
              )}
              {recipe.categorie && (
                <span className="text-[11px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-semibold">
                  {recipe.categorie}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl ml-2 shrink-0">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 space-y-5 pb-4">

          {/* Sélecteur de fournées */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-xs font-black text-blue-500 uppercase tracking-wider mb-3">Quantité à préparer</p>
            <div className="flex items-center justify-between gap-4">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-11 h-11 flex items-center justify-center bg-white border border-blue-200 rounded-xl text-blue-700 font-bold text-xl hover:bg-blue-100 active:bg-blue-200 transition-colors">
                −
              </button>
              <div className="flex-1 text-center">
                <input
                  type="number" min={1} value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="text-3xl font-black text-blue-700 w-16 text-center bg-transparent focus:outline-none"
                />
                <p className="text-xs text-blue-400 font-semibold mt-0.5">
                  fournée{qty > 1 ? 's' : ''} = <span className="text-blue-700 font-black">{totalUnits}</span> {recipe.unite || 'pcs'}
                </p>
              </div>
              <button onClick={() => setQty(q => q + 1)}
                className="w-11 h-11 flex items-center justify-center bg-white border border-blue-200 rounded-xl text-blue-700 font-bold text-xl hover:bg-blue-100 active:bg-blue-200 transition-colors">
                +
              </button>
            </div>
          </div>

          {/* Ingrédients */}
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">
              Ingrédients{ingredients.length > 0 ? ` (${ingredients.length})` : ''}
            </p>
            {ingredients.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun ingrédient enregistré</p>
            ) : (
              <div className="space-y-1">
                {ingredients.map((ing, i) => {
                  const isSR = !!ing.sous_recipe_id;
                  const nom = isSR ? ing.sous_recipe?.nom : ing.stock_item?.nom;
                  const unite = isSR ? 'kg' : (ing.stock_item?.unite || '');
                  const qteScaled = ing.quantite * factor;
                  const kgPerUnit = isSR && ing.gabarit_nom && ing.gabarit_poids_kg ? ing.gabarit_poids_kg : 1;
                  const displayQte = isSR ? formatQte(qteScaled * kgPerUnit, 'kg') : formatQte(qteScaled, unite);
                  const cout = isSR
                    ? (() => {
                        const sr = ing.sous_recipe || sousRecettes.find(s => s.id === ing.sous_recipe_id);
                        if (!sr) return 0;
                        return qteScaled * kgPerUnit * calcSRCostPerKg(sr, sousRecettes);
                      })()
                    : qteScaled * (ing.stock_item?.prix_moyen_pondere || 0);

                  return (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isSR && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-bold shrink-0">SR</span>
                        )}
                        <span className="text-sm text-gray-800 font-medium truncate">{nom || '—'}</span>
                        {ing.gabarit_nom && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded font-medium shrink-0">{ing.gabarit_nom}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-sm font-black text-gray-900 tabular-nums">{displayQte}</span>
                        {cout > 0 && (
                          <span className="text-xs text-gray-400 tabular-nums w-16 text-right">{cout.toFixed(2)} MAD</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Procédé (accordéon) */}
          {recipe.procede && (
            <div>
              <button onClick={() => setProcOpen(v => !v)}
                className="w-full flex items-center justify-between py-2 text-xs font-black text-gray-400 uppercase tracking-wider">
                <span>Procédé</span>
                {procOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {procOpen && (
                <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl px-4 py-3 mt-1">
                  {recipe.procede}
                </p>
              )}
            </div>
          )}

          {/* Récap coût */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
              <p className="text-[10px] text-gray-400 font-semibold">Coût total</p>
              <p className="text-sm font-black text-gray-900 mt-0.5">{totalCout.toFixed(2)}</p>
              <p className="text-[10px] text-gray-400">MAD</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
              <p className="text-[10px] text-gray-400 font-semibold">Par unité</p>
              <p className="text-sm font-black text-gray-900 mt-0.5">{costEntry.coutUnitaire.toFixed(2)}</p>
              <p className="text-[10px] text-gray-400">MAD</p>
            </div>
            {costEntry.tauxMarge !== null ? (
              <div className={`rounded-xl px-3 py-2.5 text-center ${costEntry.tauxMarge >= 30 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className="text-[10px] text-gray-400 font-semibold">Marge</p>
                <p className={`text-sm font-black mt-0.5 ${costEntry.tauxMarge >= 30 ? 'text-green-700' : 'text-red-600'}`}>
                  {costEntry.tauxMarge.toFixed(0)}%
                </p>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                <p className="text-[10px] text-gray-400 font-semibold">Marge</p>
                <p className="text-sm font-black text-gray-400 mt-0.5">—</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer — bouton Modifier */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onEdit}
            className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-xl text-gray-600 text-sm font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors">
            <Pencil size={15} />
            Modifier la recette
          </button>
        </div>
      </div>
    </div>
  );
}
