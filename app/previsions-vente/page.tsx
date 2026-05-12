'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ChevronLeft, ChevronRight, X, RefreshCw, AlertTriangle, Plus, Trash2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductRef {
  id: string;
  name: string;
  atelier: string | null;
}

interface IngredientLine {
  stock_item_id?: string | null;
  sous_recipe_id?: string | null;
  quantite: number;
  gabarit_nom?: string | null;
  gabarit_poids_kg?: number | null;
  sous_recipe?: SousRecette | null;
}

interface SousRecette {
  id: string;
  nom: string;
  rendement: number;
  perte_pct: number;
  dlc_heures: number | null;
  delai_fabrication_h: number | null;
  atelier: string | null;
  ingredients?: IngredientLine[];
}

interface Recette {
  id: string;
  nom: string;
  rendement: number;
  perte_pct: number;
  product_reference_id: string | null;
  delai_fabrication_h: number | null;
  dlc_heures: number | null;
  stock_min: number | null;
  ingredients?: IngredientLine[];
}

interface OrderItem {
  product_reference_id: string;
  quantity: number;
  delivery_date: string; // YYYY-MM-DD
}

interface Prevision {
  id: string;
  date: string;
  product_reference_id: string;
  quantite: number;
}

interface StockProduit {
  product_reference_id: string;
  quantite: number;
}

interface StockPrep {
  recipe_sheet_id: string;
  quantite_kg: number;
}

interface StockItemLight {
  id: string;
  nom: string;
  unite: string;
}

interface ProductArticle {
  id: string;
  product_reference_id: string;
  pack_type: string;
  quantity: number;
  product_state: 'frais' | 'pre_cuit' | 'pre_pousse' | 'congele' | null;
  display_name: string | null;
  is_active: boolean;
}

const ARTICLE_STATE_LABEL: Record<string, string> = {
  frais: 'Frais', pre_cuit: 'Pré-cuit', pre_pousse: 'Pré-poussé', congele: 'Congelé',
};
const ARTICLE_STATE_DLC: Record<string, number> = {
  frais: 48, pre_cuit: 96, pre_pousse: 24, congele: 720,
};
const ARTICLE_STATE_COLOR: Record<string, string> = {
  frais: 'bg-green-100 text-green-700', pre_cuit: 'bg-yellow-100 text-yellow-700',
  pre_pousse: 'bg-orange-100 text-orange-700', congele: 'bg-blue-100 text-blue-700',
};
const PACK_TYPE_LABEL: Record<string, string> = {
  unite: 'Unité', lot: 'Lot', carton: 'Carton', kg: 'kg', portion: 'Portion', boite: 'Boîte',
};

interface ManualTask {
  id: string;
  nom: string;
  atelier: string;
  date: string;
  quantite: number;
  unite: 'kg' | 'g' | 'pcs';
  note: string;
}

// ─── Types engine ─────────────────────────────────────────────────────────────

interface PrepTask {
  srId: string;
  srNom: string;
  atelier: string | null;
  prepDate: string; // YYYY-MM-DD
  dlcDate: string;  // YYYY-MM-DD
  totalQty: number; // unités de recette finale à couvrir
  kgSR: number;     // kg de SR à préparer
  pour: { refId: string; nom: string; qty: number; dates: string[]; gabaritNom?: string | null }[];
  urgent: boolean;
}

// ─── Jours fermés ────────────────────────────────────────────────────────────

interface ClosedDaysConfig {
  weekdays: number[];                    // 0=dim, 1=lun … 6=sam — fermé pour tous
  byAtelier: Record<string, number[]>;   // atelier → jours fermés spécifiques
  specificDates: string[];               // YYYY-MM-DD jours fériés / fermetures ponctuelles
}

const DEFAULT_CLOSED_DAYS: ClosedDaysConfig = {
  weekdays: [],
  byAtelier: {},
  specificDates: [],
};

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function isClosedDay(date: string, atelier: string | null, config: ClosedDaysConfig): boolean {
  const dow = new Date(date + 'T00:00:00').getDay();
  if (config.weekdays.includes(dow)) return true;
  if (config.specificDates.includes(date)) return true;
  if (atelier && config.byAtelier[atelier]?.includes(dow)) return true;
  return false;
}

// Recule jusqu'au dernier jour ouvré (max 14 jours de sécurité)
function prevWorkingDay(date: string, atelier: string | null, config: ClosedDaysConfig): string {
  let d = date;
  for (let i = 0; i < 14; i++) {
    if (!isClosedDay(d, atelier, config)) return d;
    d = addDays(d, -1);
  }
  return date; // fallback de sécurité
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatShortDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ─── Calcul kg de SR nécessaires pour N pièces d'une recette ─────────────────

function calcKgSRForRecipe(
  recette: Recette,
  srId: string,
  piecesNeeded: number,
  allSR: SousRecette[],
): number {
  // Trouver combien de kg de cette SR sont nécessaires pour 1 pièce de la recette
  const kgPerPiece = getKgSRPerUnit(recette, srId, allSR, 1 / (recette.rendement || 1));
  return kgPerPiece * piecesNeeded;
}

function getKgSRPerUnit(
  recipe: Recette | SousRecette,
  targetSRId: string,
  allSR: SousRecette[],
  factor: number,
  depth = 0,
): number {
  if (depth > 4) return 0;
  let total = 0;
  for (const ing of recipe.ingredients || []) {
    if (ing.sous_recipe_id === targetSRId) {
      // Si gabarit : quantite = fonds, kg réels = fonds × poids_par_fond
      const kgPerUnit = (ing.gabarit_nom && ing.gabarit_poids_kg) ? ing.gabarit_poids_kg : 1;
      total += ing.quantite * kgPerUnit * factor;
    } else if (ing.sous_recipe_id) {
      const nested = allSR.find(s => s.id === ing.sous_recipe_id);
      if (nested) {
        // quantite est en kg, on descend
        const nestedFactor = factor * ing.quantite;
        total += getKgSRPerUnit(nested as any, targetSRId, allSR, nestedFactor, depth + 1);
      }
    }
  }
  return total;
}

// ─── Moteur de rétro-planning ─────────────────────────────────────────────────

function buildPlan(
  days: string[],
  demandMap: Map<string, Map<string, number>>, // date → refId → qty
  productRefMap: Map<string, ProductRef>,
  recettesByRef: Map<string, Recette>,
  srMap: Map<string, SousRecette>,
  stockProduits: Map<string, number>,
  stockPreps: Map<string, number>,
  today: string,
  refDlcMap?: Map<string, number>, // refId → dlc_days (override from article DLC)
  closedDays: ClosedDaysConfig = DEFAULT_CLOSED_DAYS,
): PrepTask[] {
  // Copie mutable du stock
  const stockProd = new Map(stockProduits);
  const stockSR = new Map(stockPreps);

  // Structure intermédiaire : srId → date de besoin → { recettes et quantités }
  const srDemands = new Map<string, Map<string, { nom: string; qty: number; refId: string; gabaritNom?: string | null }[]>>();

  // Itérer sur les jours dans l'ordre
  for (const day of days) {
    const dayDemand = demandMap.get(day);
    if (!dayDemand) continue;

    for (const [refId, qty] of dayDemand) {
      // Netter le stock de produits finis
      const stock = stockProd.get(refId) || 0;
      const net = Math.max(0, qty - stock);
      if (stock > 0) stockProd.set(refId, Math.max(0, stock - qty));
      if (net <= 0) continue;

      const recette = recettesByRef.get(refId);
      if (!recette) continue;

      const ref = productRefMap.get(refId);
      const nomRecette = ref?.name ?? recette.nom;

      // Pour chaque SR utilisée dans la recette
      for (const ing of recette.ingredients || []) {
        if (!ing.sous_recipe_id) continue;
        const sr = srMap.get(ing.sous_recipe_id);
        if (!sr) continue;

        const kgNeeded = calcKgSRForRecipe(recette, sr.id, net, Array.from(srMap.values()) as any);
        if (kgNeeded <= 0) continue;

        if (!srDemands.has(sr.id)) srDemands.set(sr.id, new Map());
        const srDayMap = srDemands.get(sr.id)!;
        if (!srDayMap.has(day)) srDayMap.set(day, []);
        srDayMap.get(day)!.push({ nom: nomRecette, qty: net, refId, gabaritNom: ing.gabarit_nom || null });
      }
    }
  }

  // Transformer les demandes en PrepTask avec DLC windowing
  const tasks: PrepTask[] = [];

  for (const [srId, dayMap] of srDemands) {
    const sr = srMap.get(srId)!;
    const dlcH = sr.dlc_heures || 72; // 3 jours par défaut
    let dlcDays = Math.max(1, Math.round(dlcH / 24));
    // Réduire la fenêtre DLC si les articles ont une DLC plus courte
    if (refDlcMap) {
      for (const demands of dayMap.values()) {
        for (const d of demands) {
          const artDlc = refDlcMap.get(d.refId);
          if (artDlc !== undefined && artDlc < dlcDays) dlcDays = artDlc;
        }
      }
    }
    const delaiH = sr.delai_fabrication_h || 24;
    const delaiDays = Math.max(1, Math.round(delaiH / 24));

    const sortedDays = [...dayMap.keys()].sort();

    // Grouper par fenêtre DLC
    let windowStart: string | null = null;
    let windowEnd: string | null = null;
    let windowItems: { day: string; demands: { nom: string; qty: number; refId: string; gabaritNom?: string | null }[] }[] = [];

    function flushWindow() {
      if (windowItems.length === 0 || !windowStart) return;

      // Agréger par recette + gabarit
      const byRecette = new Map<string, { refId: string; nom: string; qty: number; dates: string[]; gabaritNom?: string | null }>();
      let totalPieces = 0;

      for (const { day, demands } of windowItems) {
        for (const d of demands) {
          const key = `${d.refId}|${d.gabaritNom || ''}`;
          if (!byRecette.has(key)) byRecette.set(key, { refId: d.refId, nom: d.nom, qty: 0, dates: [], gabaritNom: d.gabaritNom || null });
          const entry = byRecette.get(key)!;
          entry.qty += d.qty;
          if (!entry.dates.includes(day)) entry.dates.push(day);
          totalPieces += d.qty;
        }
      }

      // Calcul kg SR total
      let kgSR = 0;
      for (const { day, demands } of windowItems) {
        const dayDemand = demandMap.get(day);
        if (!dayDemand) continue;
        for (const d of demands) {
          const recette = recettesByRef.get(d.refId);
          if (!recette) continue;
          const kg = calcKgSRForRecipe(recette, srId, d.qty, Array.from(srMap.values()) as any);
          kgSR += kg;
        }
      }

      // Netter le stock de SR
      const stockKg = stockSR.get(srId) || 0;
      const netKg = Math.max(0, kgSR - stockKg);
      if (stockKg > 0) stockSR.set(srId, Math.max(0, stockKg - kgSR));

      if (netKg <= 0) {
        windowItems = [];
        windowStart = null;
        windowEnd = null;
        return;
      }

      const dlcDate = windowEnd!;
      // Recule si le jour calculé est fermé pour cet atelier
      const rawPrepDate = addDays(windowStart!, -delaiDays);
      const prepDate = prevWorkingDay(rawPrepDate, sr.atelier, closedDays);
      const urgent = daysBetween(today, prepDate) <= 0;

      tasks.push({
        srId,
        srNom: sr.nom,
        atelier: sr.atelier || null,
        prepDate: prepDate < today ? today : prepDate,
        dlcDate,
        totalQty: totalPieces,
        kgSR: netKg,
        pour: Array.from(byRecette.values()).sort((a, b) => b.qty - a.qty),
        urgent,
      });

      windowItems = [];
      windowStart = null;
      windowEnd = null;
    }

    for (const day of sortedDays) {
      if (!windowStart) {
        windowStart = day;
        windowEnd = addDays(day, dlcDays - 1);
      } else if (day > windowEnd!) {
        flushWindow();
        windowStart = day;
        windowEnd = addDays(day, dlcDays - 1);
      }
      windowItems.push({ day, demands: dayMap.get(day)! });
    }
    flushWindow();
  }

  // Fusionner les tâches ayant la même SR et le même prepDate
  const merged = new Map<string, PrepTask>();
  for (const task of tasks) {
    const key = `${task.srId}|${task.prepDate}`;
    if (merged.has(key)) {
      const ex = merged.get(key)!;
      ex.kgSR += task.kgSR;
      ex.totalQty += task.totalQty;
      if (task.dlcDate > ex.dlcDate) ex.dlcDate = task.dlcDate;
      ex.urgent = ex.urgent || task.urgent;
      for (const p of task.pour) {
        const found = ex.pour.find(ep => ep.nom === p.nom && ep.gabaritNom === p.gabaritNom);
        if (found) {
          found.qty += p.qty;
          for (const d of p.dates) { if (!found.dates.includes(d)) found.dates.push(d); }
        } else {
          ex.pour.push({ ...p, dates: [...p.dates] });
        }
      }
      ex.pour.sort((a, b) => b.qty - a.qty);
    } else {
      merged.set(key, { ...task, pour: task.pour.map(p => ({ ...p, dates: [...p.dates] })) });
    }
  }

  return [...merged.values()].sort((a, b) => a.prepDate.localeCompare(b.prepDate));
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ task, stockPreps, onStockClick, onDoubleClick, completed }: {
  task: PrepTask;
  stockPreps: { recipe_sheet_id: string; quantite_kg: number }[];
  onStockClick: (v: { srId: string; nom: string; kgQty: number }) => void;
  onDoubleClick?: () => void;
  completed?: boolean;
}) {
  const stockSR = stockPreps.find(s => s.recipe_sheet_id === task.srId);
  return (
    <div onDoubleClick={onDoubleClick}
      className={`bg-white border rounded-2xl p-4 space-y-3 cursor-pointer select-none transition-opacity ${completed ? 'opacity-40' : ''} ${task.urgent ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}
      title="Double-cliquer pour ouvrir la fiche de production">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black text-gray-900 text-base leading-tight">{task.srNom}</p>
          <p className="text-xs text-gray-400 mt-0.5">DLC jusqu'au {formatShortDate(task.dlcDate)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xl font-black tabular-nums ${task.urgent ? 'text-red-600' : 'text-blue-600'}`}>
            {task.kgSR >= 1 ? `${task.kgSR.toFixed(2)} kg` : `${Math.round(task.kgSR * 1000)} g`}
          </p>
          <button onClick={() => onStockClick({ srId: task.srId, nom: task.srNom, kgQty: stockSR?.quantite_kg || 0 })}
            className="text-[10px] text-gray-400 hover:text-blue-500 mt-0.5">
            stock: {stockSR?.quantite_kg ? `${stockSR.quantite_kg} kg` : '0 kg'}
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pour</p>
        <div className="space-y-1">
          {task.pour.map((p, j) => (
            <div key={j} className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-700 truncate">{p.nom}</span>
              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-gray-900">{p.qty} pcs</span>
                <span className="text-xs text-gray-400 ml-1">{p.dates.map(d => formatShortDate(d)).join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  // Date stable — calculée une seule fois au montage, jamais recréée
  const todayStr = useRef(new Date().toISOString().slice(0, 10)).current;

  const [tab, setTab] = useState<'planning' | 'previsions'>('planning');
  const [planView, setPlanView] = useState<string>('semaine'); // 'semaine' | 'today' | YYYY-MM-DD | 'all'
  const [selectedAtelier, setSelectedAtelier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Déplacements manuels des tâches — persistés en localStorage
  const [taskOverrides, setTaskOverrides] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('mep_overrides') || '{}'); }
    catch { return {}; }
  });
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  function mepKey(t: PrepTask) { return `${t.srId}|${t.dlcDate}`; }

  function moveTask(key: string, toDate: string) {
    setTaskOverrides(prev => {
      const next = { ...prev, [key]: toDate };
      localStorage.setItem('mep_overrides', JSON.stringify(next));
      return next;
    });
  }

  function resetTask(key: string) {
    setTaskOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      localStorage.setItem('mep_overrides', JSON.stringify(next));
      return next;
    });
  }

  // Tâches manuelles — persistées en localStorage
  const [manualTasks, setManualTasks] = useState<ManualTask[]>(() => {
    try { return JSON.parse(localStorage.getItem('mep_manual') || '[]'); }
    catch { return []; }
  });
  const [addModal, setAddModal] = useState<{ date: string } | null>(null);
  const [addForm, setAddForm] = useState({ nom: '', atelier: '', quantite: '', unite: 'kg' as 'kg' | 'g' | 'pcs', note: '', customMode: false });

  function saveManualTask() {
    if (!addModal || !addForm.nom.trim()) return;
    const task: ManualTask = {
      id: crypto.randomUUID(),
      date: addModal.date,
      nom: addForm.nom.trim(),
      atelier: addForm.atelier,
      quantite: parseFloat(addForm.quantite) || 0,
      unite: addForm.unite,
      note: addForm.note,
    };
    setManualTasks(prev => {
      const next = [...prev, task];
      localStorage.setItem('mep_manual', JSON.stringify(next));
      return next;
    });
    setAddModal(null);
    setAddForm({ nom: '', atelier: '', quantite: '', unite: 'kg' as 'kg' | 'g' | 'pcs', note: '', customMode: false });
  }

  function deleteManualTask(id: string) {
    setManualTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      localStorage.setItem('mep_manual', JSON.stringify(next));
      return next;
    });
  }

  function moveManualTask(id: string, toDate: string) {
    setManualTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, date: toDate } : t);
      localStorage.setItem('mep_manual', JSON.stringify(next));
      return next;
    });
  }

  // Modale fiche de production
  const [taskDetailModal, setTaskDetailModal] = useState<PrepTask | null>(null);
  // Tâches marquées comme terminées (localStorage)
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('completed_tasks') || '[]')); } catch { return new Set(); }
  });

  function toggleCompleted(key: string) {
    setCompletedTasks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem('completed_tasks', JSON.stringify([...next]));
      return next;
    });
  }

  // Data
  const [productRefs, setProductRefs] = useState<ProductRef[]>([]);
  const [productArticles, setProductArticles] = useState<ProductArticle[]>([]);
  const [stockItems, setStockItems] = useState<StockItemLight[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [sousRecettes, setSousRecettes] = useState<SousRecette[]>([]);
  const [previsions, setPrevisions] = useState<Prevision[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [stockProduits, setStockProduits] = useState<StockProduit[]>([]);
  const [stockPreps, setStockPreps] = useState<StockPrep[]>([]);

  // Articles prévisionnels par jour : "date|articleId" → qty (localStorage)
  const [articlePrevisions, setArticlePrevisions] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('article_previsions') || '{}'); } catch { return {}; }
  });
  // DLC overrides par article (jours) — partagé avec la page recettes via localStorage
  const [articleDlcOverrides] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('article_dlc_overrides') || '{}'); } catch { return {}; }
  });
  const [editingArticlePrev, setEditingArticlePrev] = useState<{ key: string; val: string } | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

  function saveArticlePrev(key: string, qty: number) {
    setArticlePrevisions(prev => {
      const next = { ...prev };
      if (qty <= 0) delete next[key]; else next[key] = qty;
      localStorage.setItem('article_previsions', JSON.stringify(next));
      return next;
    });
    setEditingArticlePrev(null);
  }

  function toggleExpanded(refId: string) {
    setExpandedRefs(prev => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId); else next.add(refId);
      return next;
    });
  }

  // Navigation semaine
  const [weekOffset, setWeekOffset] = useState(0);

  // ── Variantes produit (frais / congelé / prépoussé…) ────────────────────────
  // { [refId]: [{id, nom, dlc_heures}] }
  const [variantConfigs, setVariantConfigs] = useState<Record<string, { id: string; nom: string; dlc_heures: number }[]>>(() => {
    try { return JSON.parse(localStorage.getItem('variant_configs') || '{}'); } catch { return {}; }
  });
  // Quantités par variante: "date|refId|variantId" → qty
  const [variantPrevisions, setVariantPrevisions] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('variant_previsions') || '{}'); } catch { return {}; }
  });
  const [editingVariantPrev, setEditingVariantPrev] = useState<{ key: string; val: string } | null>(null);
  const [variantModal, setVariantModal] = useState<{ refId: string; nom: string } | null>(null);
  const [newVariantForm, setNewVariantForm] = useState({ nom: '', dlc_heures: '72' });

  function saveVariantPrev(key: string, qty: number) {
    setVariantPrevisions(prev => {
      const next = { ...prev };
      if (qty <= 0) delete next[key]; else next[key] = qty;
      localStorage.setItem('variant_previsions', JSON.stringify(next));
      return next;
    });
    setEditingVariantPrev(null);
  }

  function addVariant(refId: string) {
    if (!newVariantForm.nom.trim()) return;
    const variant = { id: crypto.randomUUID(), nom: newVariantForm.nom.trim(), dlc_heures: parseInt(newVariantForm.dlc_heures) || 72 };
    setVariantConfigs(prev => {
      const next = { ...prev, [refId]: [...(prev[refId] || []), variant] };
      localStorage.setItem('variant_configs', JSON.stringify(next));
      return next;
    });
    setNewVariantForm({ nom: '', dlc_heures: '72' });
  }

  function deleteVariant(refId: string, variantId: string) {
    setVariantConfigs(prev => {
      const next = { ...prev, [refId]: (prev[refId] || []).filter(v => v.id !== variantId) };
      localStorage.setItem('variant_configs', JSON.stringify(next));
      return next;
    });
    // Nettoyer les previsions associées
    setVariantPrevisions(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.includes(`|${variantId}`)) delete next[k]; });
      localStorage.setItem('variant_previsions', JSON.stringify(next));
      return next;
    });
  }

  // Edition prévisions
  const [editingPrev, setEditingPrev] = useState<{ date: string; refId: string; val: string } | null>(null);
  const [savingPrev, setSavingPrev] = useState(false);
  const [spreadModal, setSpreadModal] = useState<{ refId?: string; articleId?: string; articleQty?: number; nom: string; total: string } | null>(null);

  // Fill drag (glisser pour remplir les jours)
  const fillDragRef = useRef<{ type: 'article' | 'prevision'; id: string; qty: number; days: Set<string> } | null>(null);
  const [fillDragDays, setFillDragDays] = useState<Set<string>>(new Set());
  const [prevSearch, setPrevSearch] = useState('');
  const [showAllRefs, setShowAllRefs] = useState(true);

  // Jours fermés — persistés en localStorage
  const [closedDaysConfig, setClosedDaysConfig] = useState<ClosedDaysConfig>(() => {
    try { return JSON.parse(localStorage.getItem('closed_days_config') || 'null') || DEFAULT_CLOSED_DAYS; }
    catch { return DEFAULT_CLOSED_DAYS; }
  });
  const [showClosedDaysModal, setShowClosedDaysModal] = useState(false);

  function saveClosedDays(config: ClosedDaysConfig) {
    setClosedDaysConfig(config);
    localStorage.setItem('closed_days_config', JSON.stringify(config));
  }

  function toggleGlobalWeekday(dow: number) {
    saveClosedDays({
      ...closedDaysConfig,
      weekdays: closedDaysConfig.weekdays.includes(dow)
        ? closedDaysConfig.weekdays.filter(d => d !== dow)
        : [...closedDaysConfig.weekdays, dow],
    });
  }

  function toggleAtelierWeekday(atelier: string, dow: number) {
    const current = closedDaysConfig.byAtelier[atelier] || [];
    saveClosedDays({
      ...closedDaysConfig,
      byAtelier: {
        ...closedDaysConfig.byAtelier,
        [atelier]: current.includes(dow) ? current.filter(d => d !== dow) : [...current, dow],
      },
    });
  }

  function addSpecificDate(date: string) {
    if (!date || closedDaysConfig.specificDates.includes(date)) return;
    saveClosedDays({ ...closedDaysConfig, specificDates: [...closedDaysConfig.specificDates, date].sort() });
  }

  function removeSpecificDate(date: string) {
    saveClosedDays({ ...closedDaysConfig, specificDates: closedDaysConfig.specificDates.filter(d => d !== date) });
  }

  // Stock modals
  const [stockProdModal, setStockProdModal] = useState<{ refId: string; nom: string; qty: number } | null>(null);
  const [stockSRModal, setStockSRModal] = useState<{ srId: string; nom: string; kgQty: number } | null>(null);

  // ── Semaine affichée ────────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + weekOffset * 7);
    // Lundi de la semaine
    const day = t.getDay();
    const monday = new Date(t);
    monday.setDate(t.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [weekOffset]);

  // Planning sur 21 jours à partir d'aujourd'hui (3 semaines pour anticiper)
  const planningDays = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => addDays(todayStr, i));
  }, [todayStr]);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Requête de base sans les colonnes planning (toujours disponibles)
      const ingJoin = `ingredients:recipe_ingredients!recipe_sheet_id(sous_recipe_id, stock_item_id, quantite, gabarit_nom, gabarit_poids_kg)`;

      async function fetchRecettes(): Promise<Recette[]> {
        // Essai avec colonnes planning
        const res = await supabase.from('recipe_sheets')
          .select(`id, nom, rendement, perte_pct, product_reference_id, delai_fabrication_h, dlc_heures, stock_min, ${ingJoin}`)
          .eq('type', 'recette');
        if (!res.error) return (res.data || []) as Recette[];
        console.warn('Planning: fallback recettes sans colonnes planning', res.error.message);
        // Fallback sans colonnes planning
        const fallback = await supabase.from('recipe_sheets')
          .select(`id, nom, rendement, perte_pct, product_reference_id, ${ingJoin}`)
          .eq('type', 'recette');
        if (fallback.error) console.error('Planning: recettes fallback error', fallback.error.message);
        return (fallback.data || []) as Recette[];
      }

      async function fetchSousRecettes(): Promise<SousRecette[]> {
        const res = await supabase.from('recipe_sheets')
          .select(`id, nom, rendement, perte_pct, atelier, dlc_heures, delai_fabrication_h, ${ingJoin}`)
          .eq('type', 'sous_recette');
        if (!res.error) return (res.data || []) as SousRecette[];
        console.warn('Planning: fallback SR sans colonnes planning', res.error.message);
        const fallback = await supabase.from('recipe_sheets')
          .select(`id, nom, rendement, perte_pct, atelier, ${ingJoin}`)
          .eq('type', 'sous_recette');
        if (fallback.error) console.error('Planning: SR fallback error', fallback.error.message);
        return (fallback.data || []) as SousRecette[];
      }

      async function fetchPrevisions(): Promise<Prevision[]> {
        const res = await supabase.from('previsions_ventes').select('id, date, product_reference_id, quantite')
          .gte('date', addDays(todayStr, -7)).lte('date', addDays(todayStr, 35));
        return res.error ? [] : (res.data || []) as Prevision[];
      }

      async function fetchStockProd(): Promise<StockProduit[]> {
        const res = await supabase.from('stock_produits_finis').select('product_reference_id, quantite');
        return res.error ? [] : (res.data || []) as StockProduit[];
      }

      async function fetchStockPrep(): Promise<StockPrep[]> {
        const res = await supabase.from('stock_preparations').select('recipe_sheet_id, quantite_kg');
        return res.error ? [] : (res.data || []) as StockPrep[];
      }

      const [refsRes, articlesRes, recettesData, srData, prevsData, stockProdData, stockPrepData, siRes] = await Promise.all([
        supabase.from('product_references').select('id, name, atelier').eq('is_active', true).order('name'),
        supabase.from('product_articles').select('id, product_reference_id, pack_type, quantity, product_state, display_name, is_active').eq('is_active', true),
        fetchRecettes(),
        fetchSousRecettes(),
        fetchPrevisions(),
        fetchStockProd(),
        fetchStockPrep(),
        supabase.from('stock_items').select('id, nom, unite'),
      ]);

      setProductRefs((refsRes.data || []) as ProductRef[]);
      setProductArticles((articlesRes.data || []) as ProductArticle[]);
      setRecettes(recettesData);
      setSousRecettes(srData);
      setPrevisions(prevsData);
      setStockProduits(stockProdData);
      setStockPreps(stockPrepData);
      setStockItems((siRes.data || []) as StockItemLight[]);

      // Commandes — on essaie, mais ce n'est pas bloquant
      try {
        const ordersRes = await supabase
          .from('order_items')
          .select('product_reference_id, quantity, order:orders(delivery_date)')
          .gte('order.delivery_date', todayStr)
          .lte('order.delivery_date', addDays(todayStr, 30));
        if (ordersRes.data) {
          const flat: OrderItem[] = [];
          for (const row of ordersRes.data as any[]) {
            if (row.order?.delivery_date && row.product_reference_id && row.quantity > 0) {
              flat.push({
                product_reference_id: row.product_reference_id,
                quantity: row.quantity,
                delivery_date: row.order.delivery_date,
              });
            }
          }
          setOrders(flat);
        }
      } catch {
        // Commandes non disponibles
      }
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => { load(); }, [load]);

  // ── Maps ────────────────────────────────────────────────────────────────────
  const productRefMap = useMemo(() => new Map(productRefs.map(r => [r.id, r])), [productRefs]);
  const srMap = useMemo(() => new Map(sousRecettes.map(s => [s.id, s])), [sousRecettes]);
  const recettesByRef = useMemo(() => {
    const m = new Map<string, Recette>();
    // 1. Lien explicite (product_reference_id)
    for (const r of recettes) {
      if (r.product_reference_id) m.set(r.product_reference_id, r);
    }
    // 2. Fallback par nom (insensible à la casse) — pour les recettes pas encore liées
    for (const ref of productRefs) {
      if (m.has(ref.id)) continue;
      const match = recettes.find(r =>
        r.nom.toLowerCase().trim() === ref.name.toLowerCase().trim()
      );
      if (match) m.set(ref.id, match);
    }
    return m;
  }, [recettes, productRefs]);

  // Map articleId → article pour lookup rapide
  const articleMap = useMemo(() => new Map(productArticles.map(a => [a.id, a])), [productArticles]);

  // ── Demande totale (prévisions + commandes + prévisions par article) ──────────
  const demandMap = useMemo(() => {
    const m = new Map<string, Map<string, number>>();

    function add(date: string, refId: string, qty: number) {
      if (!m.has(date)) m.set(date, new Map());
      m.get(date)!.set(refId, (m.get(date)!.get(refId) || 0) + qty);
    }

    // Prévisions globales Supabase (en pièces)
    for (const p of previsions) add(p.date, p.product_reference_id, p.quantite);
    // Commandes clients
    for (const o of orders) add(o.delivery_date, o.product_reference_id, o.quantity);
    // Prévisions par article (localStorage) — convertir en pièces : nb_lots × taille_lot
    for (const [key, nbLots] of Object.entries(articlePrevisions)) {
      if (nbLots <= 0) continue;
      const [date, articleId] = key.split('|');
      const article = articleMap.get(articleId);
      if (!article) continue;
      const pieces = nbLots * article.quantity;
      add(date, article.product_reference_id, pieces);
    }

    return m;
  }, [previsions, orders, articlePrevisions, articleMap]);

  // Helper : DLC en jours pour un article (override ou défaut par état)
  function getArticleDlcDays(article: ProductArticle): number {
    if (articleDlcOverrides[article.id] != null) return Math.max(1, articleDlcOverrides[article.id]);
    if (article.product_state && ARTICLE_STATE_DLC[article.product_state]) {
      return Math.max(1, Math.round(ARTICLE_STATE_DLC[article.product_state] / 24));
    }
    return 3;
  }

  // ── DLC par référence produit (depuis les articles prévisionnels) ─────────────
  const refDlcMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [key, nbLots] of Object.entries(articlePrevisions)) {
      if (nbLots <= 0) continue;
      const [, articleId] = key.split('|');
      const article = articleMap.get(articleId);
      if (!article || !article.product_state) continue;
      const dlcDays = getArticleDlcDays(article);
      const existing = m.get(article.product_reference_id);
      if (existing === undefined || dlcDays < existing) m.set(article.product_reference_id, dlcDays);
    }
    return m;
  }, [articlePrevisions, articleMap, articleDlcOverrides]);

  // ── Plan calculé ────────────────────────────────────────────────────────────
  const plan = useMemo(() => {
    if (loading) return [];
    const stockProdMap = new Map(stockProduits.map(s => [s.product_reference_id, s.quantite]));
    const stockPrepMap = new Map(stockPreps.map(s => [s.recipe_sheet_id, s.quantite_kg]));
    return buildPlan(
      planningDays,
      demandMap,
      productRefMap,
      recettesByRef,
      srMap,
      stockProdMap,
      stockPrepMap,
      todayStr,
      refDlcMap,
      closedDaysConfig,
    );
  }, [loading, planningDays, demandMap, productRefMap, recettesByRef, srMap, stockProduits, stockPreps, refDlcMap, closedDaysConfig]);

  // ── Prévisions par [date][refId] ─────────────────────────────────────────────
  const prevMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of previsions) m.set(`${p.date}|${p.product_reference_id}`, p.quantite);
    return m;
  }, [previsions]);

  const orderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      const key = `${o.delivery_date}|${o.product_reference_id}`;
      m.set(key, (m.get(key) || 0) + o.quantity);
    }
    return m;
  }, [orders]);

  // Refs filtrées pour la grille prévisions
  const filteredPrevRefs = useMemo(() => {
    const search = prevSearch.toLowerCase().trim();
    let refs = productRefs;
    if (search) {
      refs = refs.filter(r => r.name.toLowerCase().includes(search) || (r.atelier || '').toLowerCase().includes(search));
    } else if (!showAllRefs) {
      // Sans recherche : montrer ceux qui ont de la donnée cette semaine + ceux avec recette liée
      const active = new Set<string>();
      for (const day of weekDays) {
        const dm = demandMap.get(day);
        if (dm) for (const refId of dm.keys()) active.add(refId);
      }
      for (const refId of recettesByRef.keys()) active.add(refId);
      refs = refs.filter(r => active.has(r.id));
    }
    return refs;
  }, [productRefs, prevSearch, showAllRefs, weekDays, demandMap, recettesByRef]);

  // ── Save prévision ────────────────────────────────────────────────────────────
  async function savePrevision(date: string, refId: string, qty: number) {
    setSavingPrev(true);
    try {
      if (qty <= 0) {
        await supabase.from('previsions_ventes')
          .delete().eq('date', date).eq('product_reference_id', refId);
        setPrevisions(p => p.filter(x => !(x.date === date && x.product_reference_id === refId)));
      } else {
        const { data, error } = await supabase.from('previsions_ventes')
          .upsert({ date, product_reference_id: refId, quantite: qty }, { onConflict: 'date,product_reference_id' })
          .select('id, date, product_reference_id, quantite').single();
        if (error) throw error;
        setPrevisions(p => {
          const filtered = p.filter(x => !(x.date === date && x.product_reference_id === refId));
          return [...filtered, data as Prevision];
        });
      }
    } catch (err: any) {
      alert('Erreur : ' + (err?.message || String(err)));
    } finally {
      setSavingPrev(false);
      setEditingPrev(null);
    }
  }

  // ── Fill drag ────────────────────────────────────────────────────────────────
  function startFillDrag(type: 'article' | 'prevision', id: string, qty: number, startDay: string) {
    const days = new Set([startDay]);
    fillDragRef.current = { type, id, qty, days };
    setFillDragDays(new Set(days));
  }

  function enterFillDay(day: string) {
    if (!fillDragRef.current) return;
    fillDragRef.current.days.add(day);
    setFillDragDays(new Set(fillDragRef.current.days));
  }

  useEffect(() => {
    async function onMouseUp() {
      const drag = fillDragRef.current;
      if (!drag || drag.days.size <= 1) {
        fillDragRef.current = null;
        setFillDragDays(new Set());
        return;
      }
      const days = [...drag.days];
      if (drag.type === 'article') {
        setArticlePrevisions(prev => {
          const next = { ...prev };
          for (const day of days) { const k = `${day}|${drag.id}`; next[k] = drag.qty; }
          localStorage.setItem('article_previsions', JSON.stringify(next));
          return next;
        });
      } else {
        setSavingPrev(true);
        for (const day of days) await savePrevision(day, drag.id, drag.qty);
        setSavingPrev(false);
      }
      fillDragRef.current = null;
      setFillDragDays(new Set());
    }
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  // ── Copier une valeur sur tous les jours de la semaine ───────────────────────
  async function repeatPrevisionAllDays(refId: string, qty: number) {
    setSavingPrev(true);
    for (const day of weekDays) {
      await savePrevision(day, refId, qty);
    }
    setSavingPrev(false);
  }

  function repeatArticlePrevAllDays(articleId: string, qty: number) {
    setArticlePrevisions(prev => {
      const next = { ...prev };
      for (const day of weekDays) {
        const k = `${day}|${articleId}`;
        if (qty <= 0) delete next[k]; else next[k] = qty;
      }
      localStorage.setItem('article_previsions', JSON.stringify(next));
      return next;
    });
  }

  // ── Répartir un total sur la semaine ─────────────────────────────────────────
  async function spreadWeek(total: number) {
    if (!spreadModal || total <= 0) return;
    const openDays = weekDays.filter(d => !isClosedDay(d, null, closedDaysConfig));
    if (openDays.length === 0) return;
    const perDay = Math.round(total / openDays.length);
    const remainder = total - perDay * openDays.length;

    if (spreadModal.articleId) {
      // Répartition sur les prévisions article (localStorage)
      setArticlePrevisions(prev => {
        const next = { ...prev };
        for (let i = 0; i < openDays.length; i++) {
          const k = `${openDays[i]}|${spreadModal.articleId}`;
          const qty = perDay + (i === openDays.length - 1 ? remainder : 0);
          if (qty <= 0) delete next[k]; else next[k] = qty;
        }
        localStorage.setItem('article_previsions', JSON.stringify(next));
        return next;
      });
      setSpreadModal(null);
    } else if (spreadModal.refId) {
      // Répartition sur les prévisions Supabase
      setSavingPrev(true);
      try {
        for (let i = 0; i < openDays.length; i++) {
          const qty = perDay + (i === openDays.length - 1 ? remainder : 0);
          await savePrevision(openDays[i], spreadModal.refId, qty);
        }
      } finally {
        setSavingPrev(false);
        setSpreadModal(null);
      }
    }
  }

  // ── Save stock produit ────────────────────────────────────────────────────────
  async function saveStockProduit(refId: string, qty: number) {
    try {
      await supabase.from('stock_produits_finis')
        .upsert({ product_reference_id: refId, quantite: qty, updated_at: new Date().toISOString() }, { onConflict: 'product_reference_id' });
      setStockProduits(p => {
        const filtered = p.filter(x => x.product_reference_id !== refId);
        return [...filtered, { product_reference_id: refId, quantite: qty }];
      });
    } catch (err: any) {
      alert('Erreur stock : ' + (err?.message || String(err)));
    }
    setStockProdModal(null);
  }

  // ── Save stock SR ─────────────────────────────────────────────────────────────
  async function saveStockSR(srId: string, kgQty: number) {
    try {
      await supabase.from('stock_preparations')
        .upsert({ recipe_sheet_id: srId, quantite_kg: kgQty, updated_at: new Date().toISOString() }, { onConflict: 'recipe_sheet_id' });
      setStockPreps(p => {
        const filtered = p.filter(x => x.recipe_sheet_id !== srId);
        return [...filtered, { recipe_sheet_id: srId, quantite_kg: kgQty }];
      });
    } catch (err: any) {
      alert('Erreur stock : ' + (err?.message || String(err)));
    }
    setStockSRModal(null);
  }

  // ── Lier recette → ref produit depuis le planning ────────────────────────────
  async function linkRecipeToRef(recetteId: string, refId: string) {
    try {
      const { error } = await supabase.from('recipe_sheets')
        .update({ product_reference_id: refId }).eq('id', recetteId);
      if (error) throw error;
      setRecettes(prev => prev.map(r => r.id === recetteId ? { ...r, product_reference_id: refId } : r));
    } catch (err: any) {
      alert('Erreur liaison : ' + (err?.message || String(err)));
    }
  }

  // ── Plan avec déplacements manuels appliqués ─────────────────────────────────
  const planWithOverrides = useMemo(() => {
    // Appliquer les overrides de date
    const remapped = plan.map(t => {
      const key = mepKey(t);
      const override = taskOverrides[key];
      return override ? { ...t, prepDate: override, urgent: override <= todayStr } : t;
    });
    // Re-fusionner les tâches de même SR qui ont le même prepDate après déplacement
    const merged = new Map<string, PrepTask>();
    for (const task of remapped) {
      const key = `${task.srId}|${task.prepDate}`;
      if (merged.has(key)) {
        const ex = merged.get(key)!;
        ex.kgSR += task.kgSR;
        ex.totalQty += task.totalQty;
        if (task.dlcDate > ex.dlcDate) ex.dlcDate = task.dlcDate;
        ex.urgent = ex.urgent || task.urgent;
        for (const p of task.pour) {
          const found = ex.pour.find(ep => ep.nom === p.nom && ep.gabaritNom === p.gabaritNom);
          if (found) {
            found.qty += p.qty;
            for (const d of p.dates) { if (!found.dates.includes(d)) found.dates.push(d); }
          } else {
            ex.pour.push({ ...p, dates: [...p.dates] });
          }
        }
        ex.pour.sort((a, b) => b.qty - a.qty);
      } else {
        merged.set(key, { ...task, pour: task.pour.map(p => ({ ...p, dates: [...p.dates] })) });
      }
    }
    return [...merged.values()].sort((a, b) => a.prepDate.localeCompare(b.prepDate));
  }, [plan, taskOverrides, todayStr]);

  // ── Grouper tasks par date ────────────────────────────────────────────────────
  const tasksByDate = useMemo(() => {
    const m = new Map<string, PrepTask[]>();
    for (const t of planWithOverrides) {
      if (!m.has(t.prepDate)) m.set(t.prepDate, []);
      m.get(t.prepDate)!.push(t);
    }
    return m;
  }, [planWithOverrides]);

  const allPrepDates = useMemo(() => [...tasksByDate.keys()].sort(), [tasksByDate]);
  const next7Days = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(todayStr, i)),
  [todayStr]);

  const visiblePrepDates = useMemo(() => {
    if (planView === 'semaine' || planView === 'all') return allPrepDates;
    const selectedDate = planView === 'today' ? todayStr : planView;
    return allPrepDates.filter(d => d === selectedDate);
  }, [allPrepDates, planView, todayStr]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Calcul du planning…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Modal ajout MEP manuelle */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={() => setAddModal(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-gray-900">Ajouter une MEP</p>
                <p className="text-xs text-gray-400">{formatDate(addModal.date)}</p>
              </div>
              <button onClick={() => setAddModal(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-500">Sous-recette *</span>
                {!addForm.customMode ? (
                  <select autoFocus
                    value={addForm.nom}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setAddForm(f => ({ ...f, nom: '', customMode: true }));
                      } else {
                        const sr = sousRecettes.find(s => s.nom === e.target.value);
                        setAddForm(f => ({ ...f, nom: e.target.value, atelier: sr?.atelier || f.atelier }));
                      }
                    }}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option value="">— Sélectionner…</option>
                    {sousRecettes.sort((a, b) => a.nom.localeCompare(b.nom)).map(sr => (
                      <option key={sr.id} value={sr.nom}>{sr.nom}{sr.atelier ? ` (${sr.atelier})` : ''}</option>
                    ))}
                    <option value="__custom__">✏️ Saisir manuellement…</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input autoFocus value={addForm.nom}
                      onChange={e => setAddForm(f => ({ ...f, nom: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && saveManualTask()}
                      placeholder="Nom de la préparation"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <button type="button" onClick={() => setAddForm(f => ({ ...f, nom: '', customMode: false }))}
                      className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">
                      ← Liste
                    </button>
                  </div>
                )}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-500">Atelier</span>
                  <select value={addForm.atelier} onChange={e => setAddForm(f => ({ ...f, atelier: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">—</option>
                    {[...new Set(sousRecettes.map(s => s.atelier).filter(Boolean))].sort().map(a => (
                      <option key={a!} value={a!}>{a}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-500">Quantité</span>
                  <div className="flex gap-2">
                    <input
                      type="number" min={0} step={0.1}
                      value={addForm.quantite}
                      onChange={e => setAddForm(f => ({ ...f, quantite: e.target.value }))}
                      placeholder="0"
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <select value={addForm.unite}
                      onChange={e => setAddForm(f => ({ ...f, unite: e.target.value as 'kg' | 'g' | 'pcs' }))}
                      className="px-2 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="pcs">pcs</option>
                    </select>
                  </div>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-500">Note</span>
                <input value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optionnel"
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAddModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={saveManualTask} disabled={!addForm.nom.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal gestion variantes */}
      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={() => setVariantModal(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-gray-900">Variantes</p>
                <p className="text-xs text-gray-400">{variantModal.nom}</p>
              </div>
              <button onClick={() => setVariantModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            {/* Liste des variantes existantes */}
            <div className="space-y-2">
              {(variantConfigs[variantModal.refId] || []).map(v => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-sm font-semibold text-gray-800 flex-1">{v.nom}</span>
                  <span className="text-xs text-gray-400">DLC {v.dlc_heures}h</span>
                  <button onClick={() => deleteVariant(variantModal.refId, v.id)} className="text-gray-300 hover:text-red-400"><X size={12} /></button>
                </div>
              ))}
              {(variantConfigs[variantModal.refId] || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Aucune variante — ajouter ci-dessous</p>
              )}
            </div>
            {/* Ajouter une variante */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Ajouter une variante</p>
              <div className="flex gap-2">
                <input value={newVariantForm.nom}
                  onChange={e => setNewVariantForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Nom (ex: frais, congelé…)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 shrink-0">DLC (heures) :</label>
                <input type="number" min={1} value={newVariantForm.dlc_heures}
                  onChange={e => setNewVariantForm(f => ({ ...f, dlc_heures: e.target.value }))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <span className="text-xs text-gray-400">
                  {parseInt(newVariantForm.dlc_heures) >= 24 ? `= ${Math.round(parseInt(newVariantForm.dlc_heures)/24)} j` : ''}
                </span>
              </div>
              {/* Raccourcis communs */}
              <div className="flex gap-1 flex-wrap">
                {[{ nom: 'frais', dlc: '48' }, { nom: 'congelé', dlc: '720' }, { nom: 'prépoussé', dlc: '72' }].map(p => (
                  <button key={p.nom} onClick={() => setNewVariantForm({ nom: p.nom, dlc_heures: p.dlc })}
                    className="px-2 py-1 text-[11px] bg-gray-100 hover:bg-orange-100 text-gray-600 hover:text-orange-700 rounded-lg transition-colors">
                    {p.nom} ({parseInt(p.dlc)/24}j)
                  </button>
                ))}
              </div>
              <button onClick={() => addVariant(variantModal.refId)} disabled={!newVariantForm.nom.trim()}
                className="w-full py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-40">
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock modal produit */}
      {stockProdModal && (
        <StockModal
          title={`Stock — ${stockProdModal.nom}`}
          label="Quantité en stock (pièces)"
          value={stockProdModal.qty}
          onSave={qty => saveStockProduit(stockProdModal.refId, qty)}
          onClose={() => setStockProdModal(null)}
        />
      )}

      {/* ── Modale fiche de production ── */}
      {taskDetailModal && (() => {
        const task = taskDetailModal;
        const key = mepKey(task);
        const isDone = completedTasks.has(key);
        const sr = srMap.get(task.srId);
        const siMap = new Map(stockItems.map(s => [s.id, s]));
        // Facteur de scaling : kgSR / rendement SR
        const rendement = sr?.rendement || 1;
        const factor = task.kgSR / rendement;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden" onClick={() => setTaskDetailModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className={`p-5 rounded-t-2xl ${isDone ? 'bg-green-50' : task.urgent ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{task.atelier || 'Production'}</p>
                    <h2 className="text-2xl font-black text-gray-900 mt-0.5">{task.srNom}</h2>
                    <p className="text-sm text-gray-500 mt-1">Préparation du {formatDate(task.prepDate)} · DLC {formatShortDate(task.dlcDate)}</p>
                  </div>
                  <button onClick={() => setTaskDetailModal(null)} className="p-2 hover:bg-white/60 rounded-xl shrink-0"><X size={18} /></button>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-xl ${isDone ? 'bg-green-100' : 'bg-white'}`}>
                    <p className="text-xs text-gray-400 font-semibold">À produire</p>
                    <p className={`text-3xl font-black tabular-nums ${task.urgent ? 'text-red-600' : 'text-blue-600'}`}>
                      {task.kgSR >= 1 ? `${task.kgSR.toFixed(2)} kg` : `${Math.round(task.kgSR * 1000)} g`}
                    </p>
                  </div>
                  {task.urgent && !isDone && (
                    <span className="px-3 py-1.5 bg-red-100 text-red-600 font-black text-sm rounded-xl">⚠ URGENT</span>
                  )}
                  {isDone && (
                    <span className="px-3 py-1.5 bg-green-100 text-green-700 font-black text-sm rounded-xl">✓ TERMINÉ</span>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Pour */}
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Pour</p>
                  <div className="space-y-1">
                    {task.pour.map((p, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-gray-800 truncate">{p.nom}</span>
                          {p.gabaritNom && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 font-bold shrink-0">{p.gabaritNom}</span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-gray-900">{p.qty} pcs</span>
                          <span className="text-xs text-gray-400 ml-2">{p.dates.map(d => formatShortDate(d)).join(', ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ingrédients */}
                {sr?.ingredients && sr.ingredients.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Ingrédients (pour {task.kgSR >= 1 ? `${task.kgSR.toFixed(2)} kg` : `${Math.round(task.kgSR * 1000)} g`})</p>
                    <div className="bg-gray-50 rounded-xl overflow-hidden">
                      {sr.ingredients.map((ing, i) => {
                        const qty = ing.quantite * factor;
                        const srNested = ing.sous_recipe_id ? srMap.get(ing.sous_recipe_id) : null;
                        const si = ing.stock_item_id ? siMap.get(ing.stock_item_id) : null;
                        const nom = srNested?.nom || si?.nom || (ing.sous_recipe_id ? `SR ${ing.sous_recipe_id.slice(0, 8)}` : `MP ${ing.stock_item_id?.slice(0, 8)}`);
                        const unite = si?.unite || 'kg';
                        return (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0">
                            <span className="text-sm text-gray-700">{nom}</span>
                            <span className="text-sm font-black text-gray-900 tabular-nums">
                              {qty >= 1 ? qty.toFixed(2) : (qty * 1000).toFixed(0) + ' g'} {qty >= 1 ? unite : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-5 pt-0 flex gap-3">
                <button
                  onClick={() => { toggleCompleted(key); setTaskDetailModal(null); }}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${isDone ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-500 text-white hover:bg-green-600'}`}>
                  {isDone ? '↩ Rouvrir' : '✓ Production terminée'}
                </button>
                <button
                  onClick={() => {
                    const sr2 = srMap.get(task.srId);
                    const siMap2 = new Map(stockItems.map(s => [s.id, s]));
                    const factor2 = task.kgSR / (sr2?.rendement || 1);
                    const qtyStr = task.kgSR >= 1 ? `${task.kgSR.toFixed(2)} kg` : `${Math.round(task.kgSR * 1000)} g`;
                    const ings = (sr2?.ingredients || []).map(ing => {
                      const qty = ing.quantite * factor2;
                      const srN = ing.sous_recipe_id ? srMap.get(ing.sous_recipe_id) : null;
                      const si = ing.stock_item_id ? siMap2.get(ing.stock_item_id) : null;
                      const nom = srN?.nom || si?.nom || '—';
                      const unite = si?.unite || 'kg';
                      const qtyFmt = qty >= 1 ? `${qty.toFixed(3)} ${unite}` : `${(qty * 1000).toFixed(0)} g`;
                      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px">${nom}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:700;text-align:right">${qtyFmt}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;width:80px"><div style="width:24px;height:24px;border:2px solid #d1d5db;border-radius:4px"></div></td></tr>`;
                    }).join('');
                    const pour = task.pour.map(p => {
                      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px">${p.nom}${p.gabaritNom ? ` <span style="font-size:11px;background:#f3e8ff;color:#7c3aed;border-radius:4px;padding:1px 6px;font-weight:700">${p.gabaritNom}</span>` : ''}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:700;text-align:right">${p.qty} pcs</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">${p.dates.map(d => formatDate(d)).join(', ')}</td></tr>`;
                    }).join('');
                    // Gabarit grouping: group pour items by gabarit label, sum qty
                    const gabaritGroups = new Map<string, number>();
                    for (const p of task.pour) {
                      if (p.gabaritNom) {
                        gabaritGroups.set(p.gabaritNom, (gabaritGroups.get(p.gabaritNom) || 0) + p.qty);
                      }
                    }
                    const gabaritSection = gabaritGroups.size > 0 ? `
                    <div style="margin-bottom:20px">
                      <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;margin-bottom:8px">PAR GABARIT</div>
                      <div style="display:flex;gap:12px;flex-wrap:wrap">
                        ${[...gabaritGroups.entries()].map(([gab2, qty2]) =>
                          `<div style="background:#f3e8ff;border:2px solid #c4b5fd;border-radius:10px;padding:14px 20px;text-align:center">
                            <div style="font-size:22px;font-weight:900;color:#6d28d9">${qty2} pcs</div>
                            <div style="font-size:13px;color:#7c3aed;font-weight:700;margin-top:2px">${gab2}</div>
                          </div>`
                        ).join('')}
                      </div>
                    </div>` : '';
                    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Fiche — ${task.srNom}</title>
                    <style>
                      * { margin:0; padding:0; box-sizing:border-box; }
                      body { font-family: system-ui, -apple-system, sans-serif; background:white; color:#111; }
                      @page { size: A4; margin: 15mm 15mm 20mm; }
                      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                    </style></head><body>
                    <div style="padding:0 0 12px;border-bottom:3px solid #111;display:flex;justify-content:space-between;align-items:flex-end">
                      <div>
                        <div style="font-size:11px;font-weight:900;letter-spacing:4px;color:#6b7280;text-transform:uppercase">Boulangerie de la Koutoubia</div>
                        <div style="font-size:28px;font-weight:900;margin-top:2px">${task.srNom}</div>
                        <div style="font-size:13px;color:#6b7280;margin-top:4px">${task.atelier ? task.atelier.toUpperCase() : 'PRODUCTION'}</div>
                      </div>
                      <div style="text-align:right">
                        <div style="font-size:11px;color:#6b7280">Préparation</div>
                        <div style="font-size:18px;font-weight:900">${formatDate(task.prepDate)}</div>
                        <div style="font-size:11px;color:#6b7280;margin-top:4px">DLC : ${formatDate(task.dlcDate)}</div>
                      </div>
                    </div>

                    <div style="margin:16px 0;display:flex;gap:16px">
                      <div style="flex:1;background:#f0f9ff;border:2px solid #0ea5e9;border-radius:10px;padding:16px;text-align:center">
                        <div style="font-size:11px;font-weight:700;color:#0ea5e9;letter-spacing:2px;text-transform:uppercase">À PRODUIRE</div>
                        <div style="font-size:42px;font-weight:900;color:#0284c7;margin-top:4px">${qtyStr}</div>
                      </div>
                      ${task.urgent ? `<div style="flex:0;background:#fef2f2;border:2px solid #ef4444;border-radius:10px;padding:16px;text-align:center;min-width:120px"><div style="font-size:11px;font-weight:700;color:#ef4444;letter-spacing:2px">URGENT</div><div style="font-size:28px;margin-top:4px">⚠️</div></div>` : ''}
                    </div>

                    <div style="margin-bottom:20px">
                      <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin-bottom:8px">POUR</div>
                      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden">
                        <thead><tr style="background:#f3f4f6"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px">Produit</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px">Quantité</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px">Livraison</th></tr></thead>
                        <tbody>${pour}</tbody>
                      </table>
                    </div>

                    ${gabaritSection}

                    ${ings ? `<div style="margin-bottom:20px">
                      <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin-bottom:8px">INGRÉDIENTS</div>
                      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden">
                        <thead><tr style="background:#f3f4f6"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px">Ingrédient</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px">Quantité</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px">✓</th></tr></thead>
                        <tbody>${ings}</tbody>
                      </table>
                    </div>` : ''}

                    <div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;display:flex;gap:20px">
                      <div style="flex:1"><div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Réalisé par</div><div style="border-bottom:1px solid #d1d5db;height:32px"></div></div>
                      <div style="flex:1"><div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Heure début</div><div style="border-bottom:1px solid #d1d5db;height:32px"></div></div>
                      <div style="flex:1"><div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Heure fin</div><div style="border-bottom:1px solid #d1d5db;height:32px"></div></div>
                      <div style="flex:1"><div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Signature</div><div style="border-bottom:1px solid #d1d5db;height:32px"></div></div>
                    </div>
                    </body></html>`;
                    const w = window.open('', '_blank', 'width=800,height=900');
                    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); }
                  }}
                  className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 flex items-center gap-2">
                  🖨 Imprimer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modale répartition semaine */}
      {spreadModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSpreadModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="font-black text-gray-900">{spreadModal.nom}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Répartition sur la semaine</p>
              </div>
              <button onClick={() => setSpreadModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {spreadModal.articleId ? `Total lots à produire cette semaine` : `Total à vendre cette semaine`}
                </label>
                <input autoFocus type="number" min={1}
                  value={spreadModal.total}
                  onChange={e => setSpreadModal(m => m ? { ...m, total: e.target.value } : m)}
                  onKeyDown={e => { if (e.key === 'Enter') spreadWeek(parseInt(spreadModal.total) || 0); }}
                  placeholder="ex: 1000"
                  className="mt-2 w-full border-2 border-blue-400 rounded-xl px-4 py-3 text-xl font-black text-center focus:outline-none" />
                {spreadModal.articleId && spreadModal.articleQty && (
                  <p className="text-center text-xs text-gray-400 mt-1">
                    {parseInt(spreadModal.total) > 0 ? `= ${parseInt(spreadModal.total) * spreadModal.articleQty} pcs au total` : `1 lot = ${spreadModal.articleQty} pcs`}
                  </p>
                )}
              </div>
              {(() => {
                const total = parseInt(spreadModal.total) || 0;
                const openDays = weekDays.filter(d => !isClosedDay(d, null, closedDaysConfig));
                const perDay = total > 0 ? Math.round(total / openDays.length) : 0;
                const unit = spreadModal.articleId ? 'lots' : 'pcs';
                return total > 0 ? (
                  <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                    <span className="font-bold">{perDay} {unit}/jour</span> sur {openDays.length} jours ouverts
                    {spreadModal.articleId && spreadModal.articleQty && <span className="text-blue-500 ml-1">({perDay * spreadModal.articleQty} pcs/jour)</span>}
                    {openDays.length < 7 && <span className="text-blue-400 ml-1">({7 - openDays.length} jour{7 - openDays.length > 1 ? 's' : ''} fermé{7 - openDays.length > 1 ? 's' : ''})</span>}
                  </div>
                ) : null;
              })()}
              <button
                onClick={() => spreadWeek(parseInt(spreadModal.total) || 0)}
                disabled={savingPrev || !parseInt(spreadModal.total)}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {savingPrev ? 'Enregistrement…' : 'Répartir sur la semaine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Jours fermés */}
      {showClosedDaysModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowClosedDaysModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-black text-lg text-gray-900">Jours fermés</h2>
                <p className="text-xs text-gray-400 mt-0.5">Le moteur anticipe les MEPs sur le dernier jour ouvré</p>
              </div>
              <button onClick={() => setShowClosedDaysModal(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-6">

              {/* Jours globaux */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Tous ateliers</p>
                <div className="flex gap-2 flex-wrap">
                  {DAY_NAMES.map((name, dow) => (
                    <button key={dow} onClick={() => toggleGlobalWeekday(dow)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                        closedDaysConfig.weekdays.includes(dow)
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Par atelier */}
              {[...new Set([...sousRecettes.map(s => s.atelier).filter(Boolean) as string[]])].sort().map(atelier => (
                <div key={atelier}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{atelier}</p>
                  <div className="flex gap-2 flex-wrap">
                    {DAY_NAMES.map((name, dow) => {
                      const globalClosed = closedDaysConfig.weekdays.includes(dow);
                      const atelierClosed = closedDaysConfig.byAtelier[atelier]?.includes(dow);
                      return (
                        <button key={dow} onClick={() => !globalClosed && toggleAtelierWeekday(atelier, dow)}
                          disabled={globalClosed}
                          title={globalClosed ? 'Fermé globalement' : undefined}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                            globalClosed ? 'bg-red-100 text-red-300 border-red-100 cursor-not-allowed'
                            : atelierClosed ? 'bg-orange-400 text-white border-orange-400'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Jours fériés / fermetures ponctuelles */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Fermetures ponctuelles</p>
                <div className="flex gap-2 mb-3">
                  <input type="date" min={todayStr}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                    onChange={e => { if (e.target.value) { addSpecificDate(e.target.value); e.target.value = ''; } }} />
                </div>
                {closedDaysConfig.specificDates.length === 0
                  ? <p className="text-xs text-gray-400">Aucune fermeture ponctuelle</p>
                  : (
                    <div className="flex flex-wrap gap-2">
                      {closedDaysConfig.specificDates.map(d => (
                        <span key={d} className="flex items-center gap-1 bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-100">
                          {formatDate(d)}
                          <button onClick={() => removeSpecificDate(d)} className="hover:text-red-800 ml-0.5"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  )}
              </div>

              <p className="text-xs text-gray-400 bg-blue-50 rounded-xl p-3">
                <span className="font-bold text-blue-600">Comment ça marche :</span> Si une MEP est calculée un dimanche fermé, le moteur la décale automatiquement au samedi (ou plus tôt si le samedi est aussi fermé). La quantité reste la même, elle est juste anticipée.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stock modal SR */}
      {stockSRModal && (
        <StockModal
          title={`Stock — ${stockSRModal.nom}`}
          label="Quantité en stock (kg)"
          value={stockSRModal.kgQty}
          step={0.1}
          onSave={qty => saveStockSR(stockSRModal.srId, qty)}
          onClose={() => setStockSRModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rétro-planning de production</h1>
          <p className="text-sm text-gray-400">
            {plan.length} tâche{plan.length > 1 ? 's' : ''} de préparation sur 21 jours
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowClosedDaysModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
            🗓 Jours fermés
            {(closedDaysConfig.weekdays.length > 0 || closedDaysConfig.specificDates.length > 0 || Object.values(closedDaysConfig.byAtelier).some(v => v.length > 0)) && (
              <span className="w-2 h-2 bg-orange-400 rounded-full" />
            )}
          </button>
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button onClick={() => setTab('planning')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'planning' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          Planning calculé
        </button>
        <button onClick={() => setTab('previsions')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'previsions' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          Prévisions de vente
        </button>
      </div>

      {/* ── TAB PLANNING ── */}
      {tab === 'planning' && (
        <div className="space-y-4">
          {/* Diagnostic — toujours visible si pas de tâches ou si des produits sont bloqués */}
          {(() => {
            type DiagItem = { refId: string; nom: string; status: 'no_recipe' | 'no_sr'; recette: Recette | null };
            const diagnostics: DiagItem[] = [];
            for (const day of planningDays) {
              const dm = demandMap.get(day);
              if (!dm) continue;
              for (const [refId] of dm) {
                const ref = productRefMap.get(refId);
                if (!ref) continue;
                if (diagnostics.find(d => d.refId === refId)) continue;
                const recette = recettesByRef.get(refId);
                if (!recette) {
                  diagnostics.push({ refId, nom: ref.name, status: 'no_recipe', recette: null });
                } else {
                  const hasSR = (recette.ingredients || []).some(i => i.sous_recipe_id);
                  if (!hasSR) diagnostics.push({ refId, nom: ref.name, status: 'no_sr', recette });
                }
              }
            }
            if (diagnostics.length === 0) return null;
            return (
              <div className="border border-orange-200 bg-orange-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-orange-500 shrink-0" />
                  <p className="text-sm font-bold text-orange-800">
                    {diagnostics.length} produit{diagnostics.length > 1 ? 's' : ''} bloqué{diagnostics.length > 1 ? 's' : ''} — pas de tâches générées
                  </p>
                </div>
                <div className="space-y-3">
                  {diagnostics.map((d) => (
                    <div key={d.refId} className="bg-white rounded-xl p-3 space-y-2 border border-orange-100">
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          d.status === 'no_recipe' ? 'bg-red-200 text-red-700' : 'bg-yellow-200 text-yellow-700'
                        }`}>!</span>
                        <span className="font-semibold text-gray-800 text-sm">{d.nom}</span>
                        <span className="text-xs text-gray-400">
                          {d.status === 'no_recipe' ? 'Aucune recette liée' : 'Recette sans sous-recettes'}
                        </span>
                      </div>
                      {d.status === 'no_recipe' && (
                        <div className="flex items-center gap-2 pl-6">
                          <span className="text-xs text-gray-500 shrink-0">Lier à :</span>
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) linkRecipeToRef(e.target.value, d.refId); }}
                            className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                            <option value="">— Sélectionner une recette…</option>
                            {recettes
                              .sort((a, b) => a.nom.localeCompare(b.nom))
                              .map(r => {
                                const hasSR = (r.ingredients || []).some(i => i.sous_recipe_id);
                                const alreadyLinked = r.product_reference_id && r.product_reference_id !== d.refId;
                                return (
                                  <option key={r.id} value={r.id}>
                                    {r.nom}{hasSR ? ' ✓' : ' (sans SR)'}{alreadyLinked ? ' — déjà liée' : ''}
                                  </option>
                                );
                              })}
                          </select>
                        </div>
                      )}
                      {d.status === 'no_sr' && (
                        <p className="text-xs text-yellow-600 pl-6">Ajouter des sous-recettes dans "{d.recette?.nom}" (crème, fond, appareil…)</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Contrôles vue + filtres atelier */}
          {plan.length > 0 && (() => {
            const allAteliers = [...new Set(planWithOverrides.map(t => t.atelier || 'Sans atelier'))].sort((a, b) =>
              a === 'Sans atelier' ? 1 : b === 'Sans atelier' ? -1 : a.localeCompare(b)
            );
            return (
              <div className="space-y-3">
                {/* Sélecteur de vue */}
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
                  <button onClick={() => setPlanView('semaine')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${planView === 'semaine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                    Semaine
                  </button>
                  <div className="w-px bg-gray-300 mx-1 self-stretch" />
                  {next7Days.map((day, i) => {
                    const isSelected = planView === 'today' ? i === 0 : planView === day;
                    const label = i === 0
                      ? "Auj."
                      : new Date(day + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' });
                    const hasTasks = tasksByDate.has(day);
                    return (
                      <button key={day} onClick={() => setPlanView(i === 0 ? 'today' : day)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all relative ${
                          isSelected ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        {label}
                        {hasTasks && !isSelected && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-400 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                {/* Filtres atelier */}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setSelectedAtelier(null)}
                    className={`px-4 py-2 rounded-2xl text-sm font-black transition-colors ${selectedAtelier === null ? 'bg-gray-900 text-white' : 'bg-[#fdf0dc] text-[#8b5e3c] hover:bg-[#f5e2c0]'}`}>
                    Tous
                  </button>
                  {allAteliers.map(a => {
                    const count = planWithOverrides.filter(t => (t.atelier || 'Sans atelier') === a).length;
                    const active = selectedAtelier === a;
                    return (
                      <button key={a} onClick={() => setSelectedAtelier(active ? null : a)}
                        className={`px-4 py-2 rounded-2xl text-sm font-black transition-colors flex items-center gap-2 ${active ? 'bg-gray-900 text-white' : 'bg-[#fdf0dc] text-[#8b5e3c] hover:bg-[#f5e2c0]'}`}>
                        {a}
                        <span className={`text-xs font-bold ${active ? 'text-gray-300' : 'text-[#c4895a]'}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {plan.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
              <p className="text-gray-400 font-medium">Aucune tâche de préparation calculée.</p>
              <p className="text-sm text-gray-300 mt-1">Les recettes doivent utiliser des sous-recettes pour générer des tâches de préparation.</p>
            </div>

          ) : planView === 'semaine' ? (
            /* ── VUE KANBAN SEMAINE ── */
            <div>
              <div className="grid grid-cols-7 gap-2">
                {next7Days.map((day, i) => {
                  const isToday = day === todayStr;
                  const isPast = day < todayStr;
                  const colTasks = (tasksByDate.get(day) || [])
                    .filter(t => !selectedAtelier || (t.atelier || 'Sans atelier') === selectedAtelier);
                  const colManual = manualTasks.filter(t =>
                    t.date === day && (!selectedAtelier || t.atelier === selectedAtelier || (!t.atelier && selectedAtelier === 'Sans atelier'))
                  );
                  const totalCount = colTasks.length + colManual.length;
                  const isDragOver = dragOverDay === day;

                  return (
                    <div key={day}
                      className={`flex flex-col min-w-0 rounded-2xl transition-colors ${isDragOver ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-gray-50'}`}
                      onDragOver={e => { e.preventDefault(); setDragOverDay(day); }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null); }}
                      onDrop={e => {
                        e.preventDefault();
                        if (draggingKey) {
                          if (draggingKey.startsWith('manual:')) {
                            moveManualTask(draggingKey.slice(7), day);
                          } else {
                            moveTask(draggingKey, day);
                          }
                        }
                        setDraggingKey(null);
                        setDragOverDay(null);
                      }}>

                      {/* En-tête colonne */}
                      <div className={`px-3 pt-3 pb-2 rounded-t-2xl ${isToday ? 'bg-blue-600' : isPast ? 'bg-red-100' : 'bg-transparent'}`}>
                        <p className={`text-xs font-black uppercase tracking-wider ${isToday ? 'text-blue-100' : isPast ? 'text-red-400' : 'text-gray-400'}`}>
                          {new Date(day + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long' })}
                        </p>
                        <p className={`text-lg font-black leading-tight ${isToday ? 'text-white' : isPast ? 'text-red-600' : 'text-gray-900'}`}>
                          {new Date(day + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                        <p className={`text-xs mt-0.5 ${isToday ? 'text-blue-200' : 'text-gray-400'}`}>
                          {totalCount} MEP{totalCount > 1 ? 's' : ''}
                        </p>
                      </div>

                      {/* Cards calculées */}
                      <div className="flex flex-col gap-2 p-2 flex-1">
                        {colTasks.map((task) => {
                          const key = mepKey(task);
                          const isOverridden = key in taskOverrides;
                          const isDragging = draggingKey === key;
                          const atelierColor = task.atelier === 'boulangerie' ? 'border-l-amber-400' :
                            task.atelier === 'patisserie' ? 'border-l-pink-400' :
                            task.atelier === 'viennoiserie' ? 'border-l-orange-400' : 'border-l-gray-300';
                          const isDone = completedTasks.has(key);
                          return (
                            <div key={key} draggable
                              onDragStart={() => setDraggingKey(key)}
                              onDragEnd={() => { setDraggingKey(null); setDragOverDay(null); }}
                              onDoubleClick={() => setTaskDetailModal(task)}
                              className={`bg-white rounded-xl border-l-4 ${atelierColor} shadow-sm p-3 cursor-grab active:cursor-grabbing select-none transition-all ${isDragging ? 'opacity-40' : ''} ${isDone ? 'opacity-40' : ''}`}
                              title="Double-clic → fiche de production">
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className={`font-bold text-sm leading-tight truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.srNom}</p>
                                  {task.atelier && <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{task.atelier}</p>}
                                </div>
                                <p className={`text-sm font-black tabular-nums shrink-0 ${isDone ? 'text-gray-300' : task.urgent ? 'text-red-600' : 'text-blue-600'}`}>
                                  {task.kgSR >= 1 ? `${task.kgSR.toFixed(1)}kg` : `${Math.round(task.kgSR * 1000)}g`}
                                </p>
                              </div>
                              <div className="mt-1.5 space-y-0.5">
                                {task.pour.slice(0, 2).map((p, j) => (
                                  <p key={j} className="text-[11px] text-gray-500 truncate">
                                    {p.nom} <span className="font-semibold text-gray-700">{p.qty}pcs</span>
                                  </p>
                                ))}
                                {task.pour.length > 2 && <p className="text-[10px] text-gray-400">+{task.pour.length - 2} autres</p>}
                              </div>
                              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-50">
                                <p className="text-[10px] text-gray-400">DLC {formatShortDate(task.dlcDate)}</p>
                                <div className="flex items-center gap-2">
                                  {isDone && <span className="text-[10px] font-bold text-green-500">✓ Terminé</span>}
                                  {isOverridden && !isDone && <button onClick={e => { e.stopPropagation(); resetTask(key); }} className="text-[10px] text-gray-300 hover:text-red-400">↩ reset</button>}
                                  {task.urgent && !isDone && <span className="text-[10px] font-bold text-red-500">URGENT</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Cards manuelles */}
                        {colManual.map((task) => {
                          const dragKey = `manual:${task.id}`;
                          const isDragging = draggingKey === dragKey;
                          const atelierColor = task.atelier === 'boulangerie' ? 'border-l-amber-400' :
                            task.atelier === 'patisserie' ? 'border-l-pink-400' :
                            task.atelier === 'viennoiserie' ? 'border-l-orange-400' : 'border-l-green-400';
                          return (
                            <div key={task.id} draggable
                              onDragStart={() => setDraggingKey(dragKey)}
                              onDragEnd={() => { setDraggingKey(null); setDragOverDay(null); }}
                              className={`bg-green-50 border border-green-100 rounded-xl border-l-4 ${atelierColor} p-3 cursor-grab active:cursor-grabbing select-none transition-opacity ${isDragging ? 'opacity-40' : ''}`}>
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-gray-900 text-sm leading-tight truncate">{task.nom}</p>
                                  {task.atelier && <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{task.atelier}</p>}
                                </div>
                                <button onClick={() => deleteManualTask(task.id)} className="text-gray-300 hover:text-red-400 shrink-0 mt-0.5">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              {task.quantite > 0 && (
                                <p className="text-sm font-black text-green-700 mt-1">
                                  {task.unite === 'g' ? task.quantite :
                                   task.unite === 'kg' ? task.quantite.toFixed(task.quantite % 1 === 0 ? 0 : 2) :
                                   task.quantite} {task.unite}
                                </p>
                              )}
                              {task.note && <p className="text-[11px] text-gray-500 mt-1 truncate">{task.note}</p>}
                              <p className="text-[10px] text-green-500 mt-1.5 font-semibold">Manuel</p>
                            </div>
                          );
                        })}

                        {/* Zone drop si vide */}
                        {totalCount === 0 && (
                          <div className={`flex-1 min-h-16 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors ${isDragOver ? 'border-blue-400' : 'border-gray-200'}`}>
                            <p className="text-xs text-gray-300">Déposer ici</p>
                          </div>
                        )}

                        {/* Bouton ajouter */}
                        <button
                          onClick={() => { setAddModal({ date: day }); setAddForm({ nom: '', atelier: selectedAtelier || '', quantite: '', unite: 'kg', note: '', customMode: false }); }}
                          className="w-full flex items-center justify-center gap-1 py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-xs font-semibold mt-1">
                          <Plus size={13} /> Ajouter
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          ) : (
            /* ── VUE LISTE (jour précis) ── */
            (() => {
              const hasAny = visiblePrepDates.some(date => {
                const tasks = tasksByDate.get(date) || [];
                return selectedAtelier ? tasks.some(t => (t.atelier || 'Sans atelier') === selectedAtelier) : tasks.length > 0;
              });
              if (!hasAny) return (
                <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
                  <p className="text-gray-400 font-medium">Rien à préparer ce jour.</p>
                  <button onClick={() => setPlanView('semaine')} className="mt-2 text-sm text-blue-500 hover:underline">
                    Voir la semaine
                  </button>
                </div>
              );
              return (
                <div className="space-y-6">
                  {visiblePrepDates.map(date => {
                    const rawTasks = tasksByDate.get(date)!;
                    const tasks = selectedAtelier ? rawTasks.filter(t => (t.atelier || 'Sans atelier') === selectedAtelier) : rawTasks;
                    if (tasks.length === 0) return null;
                    const isToday = date === todayStr;
                    const isPast = date < todayStr;
                    const isTomorrow = date === addDays(todayStr, 1);
                    const daysUntil = daysBetween(todayStr, date);
                    const atelierGroups = new Map<string, PrepTask[]>();
                    for (const task of tasks) {
                      const k = task.atelier || 'Sans atelier';
                      if (!atelierGroups.has(k)) atelierGroups.set(k, []);
                      atelierGroups.get(k)!.push(task);
                    }
                    const sortedAteliers = [...atelierGroups.keys()].sort((a, b) =>
                      a === 'Sans atelier' ? 1 : b === 'Sans atelier' ? -1 : a.localeCompare(b)
                    );
                    return (
                      <div key={date}>
                        <div className="flex items-center gap-3 mb-3 px-1">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${
                            isPast || isToday ? 'bg-red-100 text-red-700' :
                            isTomorrow ? 'bg-orange-100 text-orange-700' :
                            daysUntil <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-50 text-green-700'
                          }`}>
                            {isPast && <AlertTriangle size={13} />}
                            {isToday ? "Aujourd'hui" : isTomorrow ? 'Demain' : formatDate(date)}
                            {isPast && !isToday && ' (dépassé)'}
                          </div>
                          <span className="text-xs text-gray-400">{rawTasks.length} préparation{rawTasks.length > 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-4">
                          {sortedAteliers.map(atelier => (
                            <div key={atelier}>
                              {sortedAteliers.length > 1 && (
                                <div className="flex items-center gap-2 mb-2 px-1">
                                  <span className="text-xs font-black text-gray-500 uppercase tracking-wider">{atelier}</span>
                                  <div className="flex-1 h-px bg-gray-100" />
                                </div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {atelierGroups.get(atelier)!.map((task, i) => (
                                  <TaskCard key={i} task={task} stockPreps={stockPreps} onStockClick={setStockSRModal} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ── TAB PRÉVISIONS ── */}
      {tab === 'previsions' && (
        <div className="space-y-4">
          {/* Navigation semaine */}
          <div className="flex items-center gap-3">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50">
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold text-gray-900">
                {formatShortDate(weekDays[0])} — {formatShortDate(weekDays[6])}
              </p>
              {weekOffset === 0 && <p className="text-xs text-gray-400">Cette semaine</p>}
              {weekOffset === 1 && <p className="text-xs text-gray-400">Semaine prochaine</p>}
              {weekOffset < 0 && <p className="text-xs text-gray-400">Semaine passée</p>}
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Barre de recherche + toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                value={prevSearch}
                onChange={e => { setPrevSearch(e.target.value); setShowAllRefs(false); }}
                placeholder="Rechercher un produit…"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {prevSearch && (
                <button onClick={() => setPrevSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => { setShowAllRefs(v => !v); setPrevSearch(''); }}
              className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${showAllRefs ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {showAllRefs ? 'Tous les produits' : `${filteredPrevRefs.length} produit${filteredPrevRefs.length > 1 ? 's' : ''}`}
            </button>
          </div>

          {/* Grille */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider w-40">Produit</th>
                    {weekDays.map(day => {
                      const isToday = day === todayStr;
                      const isPast = day < todayStr;
                      return (
                        <th key={day} className={`text-center px-2 py-3 text-xs font-bold ${isToday ? 'text-blue-600' : isPast ? 'text-gray-300' : 'text-gray-500'}`}>
                          <div>{new Date(day + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })}</div>
                          <div className={`text-base font-black ${isToday ? 'text-blue-600' : isPast ? 'text-gray-300' : 'text-gray-900'}`}>
                            {new Date(day + 'T00:00:00').getDate()}
                          </div>
                        </th>
                      );
                    })}
                    <th className="text-center px-2 py-3 text-xs font-black text-orange-400 uppercase tracking-wider">Sem.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPrevRefs.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">Aucun produit trouvé</td></tr>
                  ) : null}
                  {filteredPrevRefs.map(ref => {
                    const refArticles = productArticles.filter(a => a.product_reference_id === ref.id);
                    const isExpanded = expandedRefs.has(ref.id);
                    return (
                      <React.Fragment key={ref.id}>
                        {/* ── Ligne produit principal ── */}
                        {(() => {
                        const weekTotal = refArticles.length > 0
                          ? weekDays.reduce((s, d) => s + refArticles.reduce((s2, a) => s2 + (articlePrevisions[`${d}|${a.id}`] || 0) * a.quantity, 0), 0)
                          : weekDays.reduce((s, d) => s + (prevMap.get(`${d}|${ref.id}`) || 0), 0);
                        return <tr className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <p className="font-semibold text-gray-800 text-xs leading-tight">{ref.name}</p>
                                {ref.atelier && <p className="text-[10px] text-gray-400">{ref.atelier}</p>}
                              </div>
                              {refArticles.length > 0 && (
                                <button onClick={() => toggleExpanded(ref.id)}
                                  className="shrink-0 text-gray-400 hover:text-blue-500 transition-colors mt-0.5 flex items-center gap-0.5 text-[10px]">
                                  <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  {refArticles.length}
                                </button>
                              )}
                            </div>
                          </td>
                          {weekDays.map(day => {
                            const key = `${day}|${ref.id}`;
                            const orderQty = orderMap.get(key) || 0;
                            const prevQty = prevMap.get(key) || 0;
                            // Total des prévisions par article (en pièces) pour ce ref+jour
                            const articleTotalPcs = refArticles.reduce((sum, art) => {
                              const nbLots = articlePrevisions[`${day}|${art.id}`] || 0;
                              return sum + nbLots * art.quantity;
                            }, 0);
                            const isEditing = editingPrev?.date === day && editingPrev?.refId === ref.id;
                            const isPast = day < todayStr;
                            return (
                              <td key={day} className="px-1 py-2 text-center">
                                <div className="space-y-1">
                                  {orderQty > 0 && (
                                    <div className="bg-blue-100 text-blue-700 text-xs font-bold rounded-lg px-2 py-1">
                                      {orderQty}<span className="block text-[9px] font-normal opacity-70">cmd</span>
                                    </div>
                                  )}
                                  {refArticles.length > 0 ? (
                                    /* Produit avec articles : total articles en lecture seule */
                                    <div className={`w-14 py-1 rounded-lg text-xs font-semibold text-center mx-auto ${articleTotalPcs > 0 ? 'bg-green-100 text-green-700' : isPast ? 'text-gray-300' : 'text-gray-200'}`}>
                                      {articleTotalPcs > 0 ? articleTotalPcs : isPast ? '—' : '·'}
                                    </div>
                                  ) : isEditing ? (
                                    <input autoFocus type="number" min={0}
                                      value={editingPrev.val}
                                      onChange={e => setEditingPrev(p => p ? { ...p, val: e.target.value } : p)}
                                      onBlur={() => savePrevision(day, ref.id, parseInt(editingPrev.val) || 0)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') savePrevision(day, ref.id, parseInt(editingPrev.val) || 0);
                                        if (e.key === 'Escape') setEditingPrev(null);
                                      }}
                                      className="w-14 text-center px-1 py-1 border-2 border-blue-400 rounded-lg text-sm font-bold focus:outline-none" />
                                  ) : (
                                    <div className="group relative inline-flex flex-col items-center"
                                      onMouseEnter={() => enterFillDay(day)}>
                                      <button disabled={isPast}
                                        onClick={() => !isPast && setEditingPrev({ date: day, refId: ref.id, val: String(prevQty || '') })}
                                        className={`w-14 py-1 rounded-lg text-xs font-semibold transition-colors select-none ${fillDragDays.has(day) ? 'bg-purple-300 text-purple-900' : isPast ? 'cursor-default' : prevQty > 0 ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-600'}`}>
                                        {fillDragDays.has(day) && fillDragRef.current ? fillDragRef.current.qty : prevQty > 0 ? prevQty : isPast ? '—' : '+'}
                                      </button>
                                      {prevQty > 0 && !isPast && (
                                        <div
                                          onMouseDown={e => { e.preventDefault(); startFillDrag('prevision', ref.id, prevQty, day); }}
                                          className="hidden group-hover:block absolute -bottom-1 -right-1 w-3 h-3 bg-purple-500 rounded-sm cursor-crosshair"
                                          title="Glisser pour remplir les jours" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-1 py-2 text-center">
                            <button
                              onClick={() => setSpreadModal({ refId: ref.id, nom: ref.name, total: weekTotal > 0 ? String(weekTotal) : '' })}
                              className={`w-14 py-1 rounded-lg text-xs font-black transition-colors ${weekTotal > 0 ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'text-gray-200 hover:bg-orange-50 hover:text-orange-400'}`}
                              title="Répartir sur la semaine">
                              {weekTotal > 0 ? weekTotal : '·'}
                            </button>
                          </td>
                        </tr>;
                        })()}

                        {/* ── Lignes articles (frais / pré-cuit / congelé…) ── */}
                        {isExpanded && refArticles.map(article => {
                          const stateLabel = article.product_state ? ARTICLE_STATE_LABEL[article.product_state] : '';
                          const stateColor = article.product_state ? ARTICLE_STATE_COLOR[article.product_state] : 'bg-gray-100 text-gray-600';
                          const packLabel = PACK_TYPE_LABEL[article.pack_type] || article.pack_type;
                          const dlcDays = getArticleDlcDays(article);
                          const hasOverride = articleDlcOverrides[article.id] != null;
                          return (
                            <tr key={article.id} className="bg-blue-50/30 hover:bg-blue-50/60">
                              <td className="px-4 py-2 pl-8">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {stateLabel && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${stateColor}`}>{stateLabel}</span>}
                                  <span className="text-[11px] font-semibold text-gray-700">
                                    {packLabel}{article.quantity > 1 ? ` de ${article.quantity}` : ''}
                                  </span>
                                  <span className={`text-[10px] ${hasOverride ? 'text-orange-400' : 'text-gray-400'}`}>DLC {dlcDays}j</span>
                                </div>
                              </td>
                              {weekDays.map(day => {
                                const aKey = `${day}|${article.id}`;
                                const qty = articlePrevisions[aKey] || 0;
                                const isEditing = editingArticlePrev?.key === aKey;
                                const isPast = day < todayStr;
                                return (
                                  <td key={day} className="px-1 py-1.5 text-center">
                                    {isEditing ? (
                                      <input autoFocus type="number" min={0}
                                        value={editingArticlePrev.val}
                                        onChange={e => setEditingArticlePrev(p => p ? { ...p, val: e.target.value } : p)}
                                        onBlur={() => saveArticlePrev(aKey, parseInt(editingArticlePrev.val) || 0)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') saveArticlePrev(aKey, parseInt(editingArticlePrev.val) || 0);
                                          if (e.key === 'Escape') setEditingArticlePrev(null);
                                        }}
                                        className="w-14 text-center px-1 py-1 border-2 border-blue-400 rounded-lg text-xs font-bold focus:outline-none" />
                                    ) : (
                                      <div className="group relative inline-flex flex-col items-center"
                                        onMouseEnter={() => enterFillDay(day)}>
                                        <button disabled={isPast}
                                          onClick={() => !isPast && setEditingArticlePrev({ key: aKey, val: String(qty || '') })}
                                          className={`w-14 py-1 rounded-lg text-xs font-semibold transition-colors select-none ${fillDragDays.has(day) && fillDragRef.current?.id === article.id ? 'bg-blue-300 text-blue-900' : isPast ? 'cursor-default' : qty > 0 ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'text-gray-300 hover:bg-blue-50 hover:text-blue-400'}`}>
                                          {fillDragDays.has(day) && fillDragRef.current?.id === article.id ? fillDragRef.current.qty : qty > 0 ? qty : isPast ? '—' : '+'}
                                        </button>
                                        {qty > 0 && !isPast && (
                                          <div
                                            onMouseDown={e => { e.preventDefault(); startFillDrag('article', article.id, qty, day); }}
                                            className="hidden group-hover:block absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-sm cursor-crosshair"
                                            title="Glisser pour remplir les jours" />
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-1 py-1.5 text-center">
                                {(() => {
                                  const artWeekTotal = weekDays.reduce((s, d) => s + (articlePrevisions[`${d}|${article.id}`] || 0), 0);
                                  return (
                                    <button
                                      onClick={() => setSpreadModal({ articleId: article.id, articleQty: article.quantity, nom: `${ref.name} — ${PACK_TYPE_LABEL[article.pack_type] || article.pack_type}`, total: artWeekTotal > 0 ? String(artWeekTotal) : '' })}
                                      className={`w-14 py-1 rounded-lg text-xs font-black transition-colors ${artWeekTotal > 0 ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'text-gray-200 hover:bg-orange-50 hover:text-orange-400'}`}
                                      title="Répartir sur la semaine">
                                      {artWeekTotal > 0 ? artWeekTotal : '·'}
                                    </button>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Légende */}
          <div className="flex items-center gap-4 px-1 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 bg-blue-100 rounded" />
              <span className="text-xs text-gray-500">Commandes clients</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 bg-purple-100 rounded" />
              <span className="text-xs text-gray-500">Prévisions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 bg-orange-100 rounded" />
              <span className="text-xs text-gray-500">Variantes (frais/congelé…)</span>
            </div>
            <span className="text-xs text-gray-400">— Cliquer sur <Plus size={10} className="inline" /> pour ajouter des variantes à un produit</span>
          </div>

          {/* Stock produits finis */}
          <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Stock produits finis</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {productRefs.map(ref => {
                const stock = stockProduits.find(s => s.product_reference_id === ref.id);
                const qty = stock?.quantite || 0;
                const recette = recettesByRef.get(ref.id);
                const stockMin = recette?.stock_min || 0;
                const alert = stockMin > 0 && qty < stockMin;
                return (
                  <button key={ref.id}
                    onClick={() => setStockProdModal({ refId: ref.id, nom: ref.name, qty })}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-colors hover:border-blue-300 ${alert ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                    <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{ref.name}</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <p className={`text-xl font-black ${alert ? 'text-red-600' : 'text-gray-900'}`}>{qty}</p>
                      <p className="text-xs text-gray-400">pcs</p>
                      {alert && <AlertTriangle size={11} className="text-red-500 ml-auto" />}
                    </div>
                    {stockMin > 0 && <p className="text-[10px] text-gray-400">min: {stockMin}</p>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stock préparations */}
          {sousRecettes.length > 0 && (
            <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Stock préparations (sous-recettes)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {sousRecettes.map(sr => {
                  const stock = stockPreps.find(s => s.recipe_sheet_id === sr.id);
                  const kg = stock?.quantite_kg || 0;
                  return (
                    <button key={sr.id}
                      onClick={() => setStockSRModal({ srId: sr.id, nom: sr.nom, kgQty: kg })}
                      className="text-left px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 hover:border-blue-300 transition-colors">
                      <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{sr.nom}</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <p className="text-xl font-black text-gray-900">{kg >= 1 ? kg.toFixed(1) : Math.round(kg * 1000)}</p>
                        <p className="text-xs text-gray-400">{kg >= 1 ? 'kg' : 'g'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal stock ─────────────────────────────────────────────────────────────

function StockModal({
  title, label, value, step = 1, onSave, onClose,
}: {
  title: string; label: string; value: number; step?: number;
  onSave: (qty: number) => void; onClose: () => void;
}) {
  const [val, setVal] = useState(String(value || ''));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-black text-gray-900">{title}</p>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400 font-semibold">{label}</span>
          <input autoFocus type="number" min={0} step={step} value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSave(parseFloat(val) || 0); if (e.key === 'Escape') onClose(); }}
            className="px-4 py-3 border-2 border-blue-400 rounded-xl text-2xl font-black text-center focus:outline-none" />
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={() => onSave(parseFloat(val) || 0)}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
