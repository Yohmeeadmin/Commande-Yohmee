'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ClipboardList, Calendar, Printer, ChevronLeft, ChevronRight, Package, X, Check, Bell, CheckCircle2, RotateCcw, ChefHat, Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { formatDate, localDateStr } from '@/lib/utils';
import { getProductStateStyle, PACK_TYPES, ProductState } from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { useUser } from '@/contexts/UserContext';

interface ProductionItem {
  refName: string;
  refCode: string;
  atelier: string;
  packType: string;
  packQuantity: number;
  productState: ProductState;
  displayName: string;
  quantity: number;
  totalUnits: number;
  slotId: string | null;
}

interface ProductionGroup {
  atelier: string;
  atelierLabel: string;
  atelierColor: string;
  atelierBgColor: string;
  items: ProductionItem[];
  totalQuantity: number;
}

// slots: tableau vide = tous, sinon filtrer par les IDs (+ 'none' pour sans créneau)
// Fusionne les items identiques (même ref + packType + packQuantity + état) au sein d'un groupe
function mergeItems(items: ProductionItem[]): ProductionItem[] {
  const merged = new Map<string, ProductionItem>();
  items.forEach(item => {
    const key = `${item.refCode}-${item.packType}-${item.packQuantity}-${item.productState}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalUnits += item.totalUnits;
    } else {
      merged.set(key, { ...item });
    }
  });
  return Array.from(merged.values()).sort((a, b) => a.refName.localeCompare(b.refName));
}

function applyFilters(
  production: ProductionGroup[],
  atelier: string,
  slots: string[]
): ProductionGroup[] {
  let result = production;

  if (slots.length > 0) {
    // Filtre par créneau puis fusion des items identiques dans ce créneau
    result = result
      .map(g => {
        const filtered = g.items.filter(i =>
          i.slotId === null ? slots.includes('none') : slots.includes(i.slotId)
        );
        const mergedItems = mergeItems(filtered);
        return { ...g, items: mergedItems, totalQuantity: mergedItems.reduce((sum, i) => sum + i.quantity, 0) };
      })
      .filter(g => g.items.length > 0);
  } else {
    // Vue "Tous" — fusion de tous les créneaux pour la même référence
    result = result.map(g => {
      const mergedItems = mergeItems(g.items.map(i => ({ ...i, slotId: null })));
      return {
        ...g,
        items: mergedItems,
        totalQuantity: mergedItems.reduce((sum, i) => sum + i.quantity, 0),
      };
    });
  }

  if (atelier !== 'all') {
    result = result.filter(g => g.atelier === atelier);
  }

  return result;
}

function SwipeableRow({ children, onSwipeLeft }: { children: React.ReactNode; onSwipeLeft: () => void }) {
  const startX = useRef(0);
  const currentX = useRef(0);
  const innerRef = useRef<HTMLDivElement>(null);
  const swiping = useRef(false);

  const snapBack = () => {
    if (innerRef.current) {
      innerRef.current.style.transition = 'transform 0.25s ease';
      innerRef.current.style.transform = 'translateX(0)';
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swiping.current = false;
    if (innerRef.current) {
      innerRef.current.style.transition = 'none';
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - startX.current;
    if (delta > 0) return; // ignore swipe droite
    currentX.current = delta;
    swiping.current = true;
    const clamped = Math.max(delta, -90);
    if (innerRef.current) {
      innerRef.current.style.transform = `translateX(${clamped}px)`;
    }
  };

  const onTouchEnd = () => {
    if (currentX.current < -60) {
      // Déclencher la confirmation
      if (innerRef.current) {
        innerRef.current.style.transition = 'transform 0.15s ease';
        innerRef.current.style.transform = 'translateX(-80px)';
      }
      setTimeout(() => {
        snapBack();
        onSwipeLeft();
      }, 120);
    } else {
      snapBack();
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Fond vert révélé par le swipe */}
      <div className="absolute inset-y-0 right-0 w-20 bg-emerald-500 flex items-center justify-center">
        <CheckCircle2 size={28} className="text-white" />
      </div>
      {/* Contenu swipeable */}
      <div
        ref={innerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}

// ─── Onglet MEP ──────────────────────────────────────────────────────────────

function MepTab({ date }: { date: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [sheets, setSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal lancement
  const [launchModal, setLaunchModal] = useState(false);
  const [launchLines, setLaunchLines] = useState<{ sheet_id: string; nb_patons: number }[]>([]);
  const [launchDate, setLaunchDate] = useState(new Date().toISOString().slice(0, 10));
  const [launching, setLaunching] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: sh }, { data: ord }] = await Promise.all([
      supabase.from('production_sheets').select(`
        id, rendement_theorique,
        sous_recette:recipe_sheets!production_sheets_sous_recette_id_fkey(id, nom),
        recipe:recipe_sheets!production_sheets_recipe_sheet_id_fkey(id, nom)
      `).order('created_at'),
      supabase.from('production_orders_fp').select(`
        id, date_production, statut, notes,
        production_order_lines(
          id, numero_paton, quantite_theorique, quantite_reelle, statut, notes,
          production_sheet:production_sheets(
            id, rendement_theorique,
            sous_recette:recipe_sheets!production_sheets_sous_recette_id_fkey(id, nom),
            recipe:recipe_sheets!production_sheets_recipe_sheet_id_fkey(id, nom)
          )
        )
      `)
      .in('statut', ['planifie', 'en_cours'])
      .order('date_production', { ascending: false }),
    ]);
    setSheets(sh || []);
    setOrders(ord || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [date]);

  function openLaunch() {
    if (sheets.length === 0) return;
    setLaunchLines([{ sheet_id: sheets[0].id, nb_patons: 1 }]);
    setLaunchDate(new Date().toISOString().slice(0, 10));
    setLaunchModal(true);
  }

  function addLaunchLine(sheetId: string) {
    setLaunchLines(l => [...l, { sheet_id: sheetId, nb_patons: 1 }]);
  }

  function updateLaunchLine(idx: number, nb: number) {
    setLaunchLines(l => l.map((x, i) => i === idx ? { ...x, nb_patons: nb } : x));
  }

  function updateLaunchSheet(idx: number, sheetId: string) {
    setLaunchLines(l => l.map((x, i) => i === idx ? { ...x, sheet_id: sheetId } : x));
  }

  function removeLaunchLine(idx: number) {
    setLaunchLines(l => l.filter((_, i) => i !== idx));
  }

  async function launchProduction() {
    if (launchLines.length === 0) return;
    setLaunching(true);
    try {
      const { data: order, error: oErr } = await supabase
        .from('production_orders_fp')
        .insert({ date_production: launchDate, statut: 'en_cours' })
        .select('id').single();
      if (oErr || !order) throw oErr;

      const lines: any[] = [];
      let paton = 1;
      for (const line of launchLines) {
        const sheet = sheets.find((s: any) => s.id === line.sheet_id);
        if (!sheet) continue;
        for (let i = 0; i < line.nb_patons; i++) {
          lines.push({
            production_order_id: order.id,
            production_sheet_id: line.sheet_id,
            numero_paton: paton++,
            quantite_theorique: sheet.rendement_theorique,
            statut: 'en_attente',
          });
        }
      }
      if (lines.length > 0) {
        const { error: lErr } = await supabase.from('production_order_lines').insert(lines);
        if (lErr) throw lErr;
      }
      setLaunchModal(false);
      load();
    } catch (e: any) {
      alert('Erreur : ' + e.message);
    } finally {
      setLaunching(false);
    }
  }

  async function toggleLine(lineId: string, current: string) {
    const newStatut = current === 'termine' ? 'en_attente' : 'termine';
    await supabase.from('production_order_lines').update({ statut: newStatut }).eq('id', lineId);
    setOrders(prev => prev.map(o => ({
      ...o,
      production_order_lines: o.production_order_lines.map((l: any) =>
        l.id === lineId ? { ...l, statut: newStatut } : l
      )
    })));
  }

  async function saveQteReelle(lineId: string, val: number) {
    await supabase.from('production_order_lines').update({ quantite_reelle: val }).eq('id', lineId);
    setOrders(prev => prev.map(o => ({
      ...o,
      production_order_lines: o.production_order_lines.map((l: any) =>
        l.id === lineId ? { ...l, quantite_reelle: val } : l
      )
    })));
  }

  async function terminerOrder(orderId: string) {
    await supabase.from('production_orders_fp').update({ statut: 'termine' }).eq('id', orderId);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Bouton nouvelle MEP */}
      <div className="flex justify-end">
        <button
          onClick={openLaunch}
          disabled={sheets.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
        >
          <Plus size={15} /> Nouvelle MEP
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <ChefHat className="mx-auto text-gray-300 mb-3" size={32} />
          <p className="text-gray-500 font-medium">Aucune MEP en cours</p>
          {sheets.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Créez d'abord des fiches dans Recettes → FP</p>
          )}
        </div>
      ) : (
        orders.map(order => {
          const lines: any[] = order.production_order_lines || [];
          const done = lines.filter((l: any) => l.statut === 'termine').length;
          const total = lines.length;
          const pct = total > 0 ? Math.round(done / total * 100) : 0;

          return (
            <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <p className="font-black text-gray-900 text-sm">
                    MEP du {new Date(order.date_production).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{done}/{total} pâtons terminés</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold text-emerald-600">{pct}%</span>
                  {done === total && total > 0 && (
                    <button onClick={() => terminerOrder(order.id)}
                      className="px-2 py-1 text-xs bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700">
                      Clôturer
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-gray-50">
                {lines.map((line: any) => {
                  const sr = line.production_sheet?.sous_recette;
                  const recipe = line.production_sheet?.recipe;
                  const isDone = line.statut === 'termine';
                  return (
                    <div key={line.id} className={`flex items-center gap-3 px-4 py-3 ${isDone ? 'opacity-60' : ''}`}>
                      <button onClick={() => toggleLine(line.id, line.statut)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400'
                        }`}>
                        {isDone && <Check size={12} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          Pâton #{line.numero_paton} — {sr?.nom || '?'}
                        </p>
                        {recipe && <p className="text-xs text-gray-400">→ {recipe.nom}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400">Théo: <span className="font-bold text-gray-600">{line.quantite_theorique}</span></span>
                        <input
                          type="number"
                          defaultValue={line.quantite_reelle ?? ''}
                          placeholder="Réel"
                          onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v)) saveQteReelle(line.id, v); }}
                          className="w-16 text-center text-xs border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ── Modal Lancement ── */}
      {launchModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/50">
          <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <p className="font-bold text-gray-900">Nouvelle MEP</p>
              <button onClick={() => setLaunchModal(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date de production</label>
                <input type="date" value={launchDate}
                  onChange={e => setLaunchDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              {/* Lignes pâtons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600">Pâtons à produire</label>
                  <button onClick={() => addLaunchLine(sheets[0]?.id)}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                    + Ajouter
                  </button>
                </div>
                <div className="space-y-2">
                  {launchLines.map((line, idx) => {
                    const sheet = sheets.find((s: any) => s.id === line.sheet_id);
                    return (
                      <div key={idx} className="p-3 bg-gray-50 rounded-xl space-y-2">
                        <div className="flex items-center gap-2">
                          <select value={line.sheet_id}
                            onChange={e => updateLaunchSheet(idx, e.target.value)}
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                            {sheets.map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.sous_recette?.nom} → {s.recipe?.nom || '?'}
                              </option>
                            ))}
                          </select>
                          {launchLines.length > 1 && (
                            <button onClick={() => removeLaunchLine(idx)}
                              className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400 flex-1">
                            {line.nb_patons} × {sheet?.rendement_theorique || 0} = <span className="font-bold text-gray-600">{line.nb_patons * (sheet?.rendement_theorique || 0)} pcs théo.</span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">Pâtons</span>
                            <input type="number" min={1} value={line.nb_patons}
                              onChange={e => updateLaunchLine(idx, parseInt(e.target.value) || 1)}
                              className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Résumé */}
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-1">Résumé</p>
                {launchLines.map((line, idx) => {
                  const sheet = sheets.find((s: any) => s.id === line.sheet_id);
                  return (
                    <div key={idx} className="flex justify-between text-xs text-emerald-600">
                      <span>{sheet?.recipe?.nom || sheet?.sous_recette?.nom}</span>
                      <span className="font-bold">{line.nb_patons * (sheet?.rendement_theorique || 0)} pcs</span>
                    </div>
                  );
                })}
                <div className="border-t border-emerald-200 mt-1.5 pt-1.5 flex justify-between text-xs font-bold text-emerald-800">
                  <span>Total pâtons</span>
                  <span>{launchLines.reduce((s, l) => s + l.nb_patons, 0)} pâtons</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setLaunchModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={launchProduction} disabled={launching || launchLines.length === 0}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2">
                <ChefHat size={14} /> {launching ? 'Lancement...' : 'Lancer la MEP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fonction pure extraite pour React Query ─────────────────────────────────

async function loadProductionFn(date: string): Promise<{ groups: ProductionGroup[]; slots: { id: string; name: string; start_time: string; end_time: string }[] }> {
  const [y, m, d] = date.split('-').map(Number);
  const JOURS_JS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const dayFr = JOURS_JS[new Date(y, m - 1, d).getDay()];

  const [{ data: orders }, { data: slotsData }, { data: recurringData }, { data: existingRecOrders }] = await Promise.all([
    supabase.from('orders').select('id, delivery_slot_id').eq('delivery_date', date).in('status', ['confirmee', 'production']),
    supabase.from('delivery_slots').select('id, name, start_time, end_time').eq('is_active', true).order('sort_order'),
    supabase.from('recurring_orders').select('id, type_recurrence, jours_semaine, date_debut, date_fin, delivery_slot_id').eq('is_active', true).lte('date_debut', date),
    supabase.from('orders').select('recurring_order_id').eq('delivery_date', date).not('recurring_order_id', 'is', null),
  ]);

  const existingRecIds = new Set((existingRecOrders || []).map((o: any) => o.recurring_order_id));
  const previews = ((recurringData || []) as any[])
    .filter(rec => {
      if (rec.date_fin && rec.date_fin < date) return false;
      if (rec.type_recurrence === 'hebdo' && !rec.jours_semaine.includes(dayFr)) return false;
      if (existingRecIds.has(rec.id)) return false;
      return true;
    })
    .map(rec => ({ recurring_order_id: rec.id, delivery_slot_id: rec.delivery_slot_id }));

  const productMap = new Map<string, ProductionItem>();

  if (orders && orders.length > 0) {
    const slotMap: Record<string, string | null> = {};
    orders.forEach((o: any) => { slotMap[o.id] = o.delivery_slot_id; });
    const { data: items } = await supabase.from('order_items').select(`order_id, quantity_ordered, units_total, article_unit_quantity, product_article:product_articles(display_name, pack_type, quantity, product_state, product_reference:product_references(name, code, atelier))`).in('order_id', orders.map((o: any) => o.id));
    (items || []).forEach((item: any) => {
      const art = item.product_article; const ref = art?.product_reference;
      if (!art || !ref) return;
      const slotId = slotMap[item.order_id] ?? null;
      const key = `${ref.code}-${art.pack_type}-${art.quantity}-${art.product_state}-${slotId ?? 'none'}`;
      const existing = productMap.get(key);
      if (existing) { existing.quantity += item.quantity_ordered; existing.totalUnits += item.units_total || 0; }
      else productMap.set(key, { refName: ref.name, refCode: ref.code, atelier: ref.atelier, packType: art.pack_type, packQuantity: art.quantity, productState: art.product_state, displayName: art.display_name, quantity: item.quantity_ordered, totalUnits: item.units_total || 0, slotId });
    });
  }

  if (previews && previews.length > 0) {
    const recurringIds = previews.map((p: any) => p.recurring_order_id);
    const previewSlotMap: Record<string, string | null> = {};
    previews.forEach((p: any) => { previewSlotMap[p.recurring_order_id] = p.delivery_slot_id; });
    const { data: previewItems } = await supabase.from('recurring_order_items').select(`recurring_order_id, quantite, product_article:product_articles!product_article_id(display_name, pack_type, quantity, product_state, product_reference:product_references(name, code, atelier))`).in('recurring_order_id', recurringIds);
    (previewItems || []).forEach((item: any) => {
      const art = item.product_article; const ref = art?.product_reference;
      if (!art || !ref) return;
      const slotId = previewSlotMap[item.recurring_order_id] ?? null;
      const key = `${ref.code}-${art.pack_type}-${art.quantity}-${art.product_state}-${slotId ?? 'none'}`;
      const existing = productMap.get(key);
      if (existing) { existing.quantity += item.quantite; existing.totalUnits += item.quantite; }
      else productMap.set(key, { refName: ref.name, refCode: ref.code, atelier: ref.atelier, packType: art.pack_type, packQuantity: art.quantity, productState: art.product_state, displayName: art.display_name, quantity: item.quantite, totalUnits: item.quantite, slotId });
    });
  }

  if (productMap.size === 0) return { groups: [], slots: slotsData || [] };

  const atelierMap = new Map<string, ProductionItem[]>();
  productMap.forEach(item => {
    const existing = atelierMap.get(item.atelier) || [];
    existing.push(item);
    atelierMap.set(item.atelier, existing);
  });

  const groups: ProductionGroup[] = Array.from(atelierMap.entries())
    .map(([atelier, items]) => ({
      atelier, atelierLabel: atelier, atelierColor: '', atelierBgColor: '',
      items: items.sort((a, b) => a.refName.localeCompare(b.refName)),
      totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
    }))
    .sort((a, b) => a.atelierLabel.localeCompare(b.atelierLabel));

  return { groups, slots: slotsData || [] };
}

export default function ProductionPage() {
  const { ateliers, getStyle: getAtelierStyle } = useAteliers();
  const { profile } = useUser();
  const defaultAtelier = profile?.ateliers?.length === 1 ? profile.ateliers[0] : 'all';

  const [date, setDate] = useState(localDateStr());
  const [production, setProduction] = useState<ProductionGroup[]>([]);
  const [selectedAtelier, setSelectedAtelier] = useState<string>(defaultAtelier);
  const [slots, setSlots] = useState<{ id: string; name: string; start_time: string; end_time: string }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'production' | 'rappel' | 'mep'>('production');
  const [rappelOrders, setRappelOrders] = useState<any[]>([]);
  const [rappelLoading, setRappelLoading] = useState(false);

  // Suivi des articles terminés — persisté dans localStorage par date
  const lsKey = (d: string) => `prod_done_${d}`;

  const [completedKeys, setCompletedKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(lsKey(localDateStr()));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const [confirmItem, setConfirmItem] = useState<{ key: string; name: string; pieces: number } | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Charger/réinitialiser depuis localStorage quand la date change
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey(date));
      setCompletedKeys(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch { setCompletedKeys(new Set()); }
    setShowCompleted(false);
  }, [date]);

  // Sauvegarder dans localStorage à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem(lsKey(date), JSON.stringify([...completedKeys]));
    } catch { /* ignore */ }
  }, [completedKeys, date]);

  const itemKey = (atelierCode: string, item: ProductionItem) =>
    `${atelierCode}|${item.refCode}|${item.packType}|${item.packQuantity}|${item.productState}`;

  // Modal impression
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printAtelier, setPrintAtelier] = useState<string>('all');
  const [printSlots, setPrintSlots] = useState<string[]>([]); // vide = tous

  const queryClient = useQueryClient();

  const { data: productionData, isLoading } = useQuery({
    queryKey: ['production', date],
    queryFn: () => loadProductionFn(date),
    staleTime: 1000 * 30, // 30s (production change souvent)
  });

  // Sync local state depuis React Query + enrichissement avec getAtelierStyle
  useEffect(() => {
    if (productionData) {
      const enriched = productionData.groups.map(g => {
        const style = getAtelierStyle(g.atelier);
        return { ...g, atelierLabel: style.label, atelierColor: style.color, atelierBgColor: style.bgColor };
      });
      setProduction(enriched);
      setSlots(productionData.slots);
    }
  }, [productionData, getAtelierStyle]);

  const loading = isLoading;

  // Realtime : commandes changent → invalide la vue production
  useEffect(() => {
    const channel = supabase.channel('production-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['production', date] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date, queryClient]);

  useEffect(() => { loadRappels(); }, []);

  async function loadRappels() {
    setRappelLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // On cherche les commandes avec rappel actif : today est dans la fenêtre [delivery_date - reminder_days, delivery_date]
      // On fetch toutes les commandes avec reminder_days non null et delivery_date >= today
      const { data } = await supabase
        .from('orders')
        .select('id, numero, delivery_date, reminder_days, total, client:clients(nom), delivery_slot:delivery_slots(name)')
        .not('reminder_days', 'is', null)
        .gte('delivery_date', localDateStr(today))
        .neq('status', 'livree')
        .neq('status', 'annulee')
        .order('delivery_date');

      // Filtrer côté client : today doit être dans la fenêtre de rappel
      const active = (data || []).filter((o: any) => {
        const delivery = new Date(o.delivery_date);
        delivery.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= o.reminder_days;
      });
      setRappelOrders(active);
    } catch (e) {
      console.error(e);
    } finally {
      setRappelLoading(false);
    }
  }


  const changeDate = (days: number) => {
    const newDate = new Date(date + 'T12:00:00');
    newDate.setDate(newDate.getDate() + days);
    setDate(localDateStr(newDate));
  };

  const goToToday = () => {
    setDate(localDateStr());
  };

  const openPrintModal = () => {
    setPrintAtelier(selectedAtelier);
    setPrintSlots(selectedSlot === 'all' ? [] : [selectedSlot]);
    setShowPrintModal(true);
  };

  const togglePrintSlot = (id: string) => {
    setPrintSlots(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(s => s !== id);
        return next; // [] = retour à "tous"
      }
      return [...prev, id];
    });
  };

  const handlePrint = () => {
    setShowPrintModal(false);
    setTimeout(() => {
      const scrollY = window.scrollY;
      window.onafterprint = () => {
        window.scrollTo(0, scrollY);
        window.onafterprint = null;
      };
      window.print();
    }, 150);
  };

  const getPackLabel = (packType: string) => {
    return PACK_TYPES.find(p => p.value === packType)?.label || packType;
  };

  // Filtrage côté client
  const displayProduction = useMemo(
    () => applyFilters(production, selectedAtelier, selectedSlot === 'all' ? [] : [selectedSlot]),
    [production, selectedAtelier, selectedSlot]
  );

  const printProduction = useMemo(
    () => applyFilters(production, printAtelier, printSlots),
    [production, printAtelier, printSlots]
  );

  const totalItems = displayProduction.reduce((sum, g) => sum + g.totalQuantity, 0);
  const totalPieces = displayProduction.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.quantity * i.packQuantity, 0), 0);
  const printTotalItems = printProduction.reduce((sum, g) => sum + g.totalQuantity, 0);
  const printTotalPieces = printProduction.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.quantity * i.packQuantity, 0), 0);

  // Label des créneaux sélectionnés pour le header print
  const printSlotLabel = printSlots.length === 0
    ? 'Tous les créneaux'
    : printSlots
        .map(id => id === 'none' ? 'Sans créneau' : (slots.find(s => s.id === id)?.name ?? id))
        .join(', ');

  const printAtelierLabel = printAtelier === 'all'
    ? 'Tous les ateliers'
    : production.find(g => g.atelier === printAtelier)?.atelierLabel || printAtelier;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* Header compact */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Production</h1>
          <p className="text-sm text-gray-400">{new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button
          type="button"
          onClick={openPrintModal}
          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
        >
          <Printer size={16} />
          <span className="hidden sm:inline">Imprimer</span>
        </button>
      </div>

      {/* Navigation date */}
      <div className="bg-white rounded-2xl border border-gray-100 print:hidden">
        <div className="flex items-center justify-between px-2 py-1">
          <button type="button" onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={goToToday} className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
              Aujourd&apos;hui
            </button>
            <div className="flex items-center gap-1.5">
              <Calendar size={16} className="text-gray-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-base font-semibold text-gray-900 border-none focus:outline-none focus:ring-0 bg-transparent"
              />
            </div>
          </div>
          <button type="button" onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 print:hidden">
        <button
          onClick={() => setActiveTab('production')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            activeTab === 'production' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
          }`}
        >
          <ClipboardList size={15} />
          Production
        </button>
        <button
          onClick={() => setActiveTab('rappel')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            activeTab === 'rappel' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
          }`}
        >
          <Bell size={15} />
          Rappels
          {rappelOrders.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'rappel' ? 'bg-white text-orange-500' : 'bg-orange-500 text-white'}`}>
              {rappelOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('mep')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            activeTab === 'mep' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
          }`}
        >
          <ChefHat size={15} />
          MEP
        </button>
      </div>

      {/* Contenu onglet MEP */}
      {activeTab === 'mep' && <MepTab date={date} />}

      {/* Contenu onglet Rappel */}
      {activeTab === 'rappel' && (
        <div className="space-y-3">
          {rappelLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : rappelOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Bell className="mx-auto text-gray-300 mb-3" size={32} />
              <p className="text-gray-500">Aucun rappel actif pour le moment</p>
            </div>
          ) : (
            rappelOrders.map((order: any) => {
              const delivery = new Date(order.delivery_date);
              delivery.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffDays = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={order.id} className="bg-white rounded-2xl border border-orange-200 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Bell className="text-orange-500" size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{order.client?.nom}</p>
                      <p className="text-sm text-gray-500">{order.numero} · {order.delivery_slot?.name || 'Sans créneau'}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-orange-600">
                      {diffDays === 0 ? 'Aujourd\'hui' : diffDays === 1 ? 'Demain' : `Dans ${diffDays} jours`}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(order.delivery_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ONGLET PRODUCTION */}
      {activeTab === 'production' && <>

      {/* Tuiles stats */}
      {(() => {
        const remainingPieces = displayProduction.reduce((sum, g) =>
          sum + g.items.filter(i => !completedKeys.has(itemKey(g.atelier, i))).reduce((s, i) => s + i.quantity * i.packQuantity, 0), 0);
        const remainingLots = displayProduction.reduce((sum, g) =>
          sum + g.items.filter(i => !completedKeys.has(itemKey(g.atelier, i))).reduce((s, i) => s + i.quantity, 0), 0);
        const doneCount = completedKeys.size;
        return (
          <div className="grid grid-cols-2 gap-3 print:hidden">
            <div className={`rounded-2xl p-4 text-white ${remainingPieces === 0 && totalPieces > 0 ? 'bg-emerald-500' : 'bg-blue-600'}`}>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1">Pièces restantes</p>
              <p className="text-4xl font-black leading-none">{remainingPieces}</p>
              {doneCount > 0 && <p className="text-white/60 text-xs mt-2">{doneCount} article{doneCount > 1 ? 's' : ''} terminé{doneCount > 1 ? 's' : ''}</p>}
              {doneCount === 0 && <p className="text-white/60 text-xs mt-2">à produire</p>}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Lots restants</p>
              <p className="text-4xl font-black text-gray-900 leading-none">{remainingLots}</p>
              <p className="text-gray-400 text-xs mt-2">sur {totalItems} total</p>
            </div>
          </div>
        );
      })()}

      {/* Filtre ateliers — chips scroll horizontal */}
      {production.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 print:hidden">
          <button
            type="button"
            onClick={() => setSelectedAtelier('all')}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border ${
              selectedAtelier === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            Tous
          </button>
          {production.map((g) => (
            <button
              type="button"
              key={g.atelier}
              onClick={() => setSelectedAtelier(selectedAtelier === g.atelier ? 'all' : g.atelier)}
              className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all border"
              style={selectedAtelier === g.atelier
                ? { backgroundColor: g.atelierColor, color: 'white', borderColor: g.atelierColor }
                : { backgroundColor: g.atelierBgColor, color: g.atelierColor, borderColor: g.atelierBgColor }
              }
            >
              {g.atelierLabel}
              <span className="ml-1.5 opacity-70 text-xs">
                {g.items.reduce((s, i) => s + i.quantity * i.packQuantity, 0)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filtre créneaux — chips scroll horizontal */}
      {slots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 print:hidden">
          <button
            type="button"
            onClick={() => setSelectedSlot('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
              selectedSlot === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            Tous créneaux
          </button>
          {[...slots].sort((a, b) => a.start_time.localeCompare(b.start_time)).map((slot) => (
            <button
              type="button"
              key={slot.id}
              onClick={() => setSelectedSlot(selectedSlot === slot.id ? 'all' : slot.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                selectedSlot === slot.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {slot.name} {slot.start_time.slice(0, 5)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedSlot(selectedSlot === 'none' ? 'all' : 'none')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
              selectedSlot === 'none' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            Sans créneau
          </button>
        </div>
      )}

      {/* Liste production */}
      {displayProduction.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center print:hidden">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500">Aucune production pour cette date</p>
          <p className="text-sm text-gray-400 mt-2">Les commandes confirmées ou en production apparaîtront ici</p>
        </div>
      ) : (
        <div className="space-y-3 print:hidden">
          {displayProduction.map((group) => {
            const activeItems = group.items.filter(i => !completedKeys.has(itemKey(group.atelier, i)));
            const doneItems = group.items.filter(i => completedKeys.has(itemKey(group.atelier, i)));
            if (activeItems.length === 0 && doneItems.length === 0) return null;
            const remainingPcs = activeItems.reduce((s, i) => s + i.quantity * i.packQuantity, 0);
            return (
              <div key={group.atelier} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Header atelier */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: group.atelierBgColor }}
                >
                  <span className="font-bold text-sm uppercase tracking-wide" style={{ color: group.atelierColor }}>
                    {group.atelierLabel}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/60" style={{ color: group.atelierColor }}>
                    {activeItems.length === 0
                      ? '✓ Terminé'
                      : `${remainingPcs} pièce${remainingPcs > 1 ? 's' : ''} restante${remainingPcs > 1 ? 's' : ''}`}
                  </span>
                </div>
                {/* Items actifs — swipeables */}
                <div className="divide-y divide-gray-50">
                  {activeItems.map((item, idx) => {
                    const stateStyle = getProductStateStyle(item.productState);
                    const pieces = item.quantity * item.packQuantity;
                    const key = itemKey(group.atelier, item);
                    return (
                      <SwipeableRow
                        key={key}
                        onSwipeLeft={() => setConfirmItem({ key, name: item.refName, pieces })}
                      >
                        <div className="flex items-center px-4 py-3 gap-3">
                          <div className="w-14 h-14 bg-gray-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border border-gray-100">
                            <span className="text-2xl font-black text-gray-900 leading-none">{pieces}</span>
                            <span className="text-gray-400 text-xs mt-0.5">pcs</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{item.refName}</p>
                            <p className="text-sm text-gray-500">{getPackLabel(item.packType)} × {item.packQuantity}</p>
                            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}>
                              {stateStyle.label}
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-sm font-bold text-gray-400">{item.quantity}</span>
                            <p className="text-xs text-gray-300">lot{item.quantity > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      </SwipeableRow>
                    );
                  })}
                </div>
                {/* Items terminés (collapsable) */}
                {doneItems.length > 0 && (
                  <div className="border-t border-gray-50">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(v => !v)}
                      className="w-full px-4 py-2 flex items-center gap-2 text-xs text-emerald-600 font-semibold bg-emerald-50 hover:bg-emerald-100 transition-colors"
                    >
                      <CheckCircle2 size={14} />
                      {doneItems.length} terminé{doneItems.length > 1 ? 's' : ''}
                      <span className="ml-auto text-emerald-400">{showCompleted ? '▲' : '▼'}</span>
                    </button>
                    {showCompleted && (
                      <div className="divide-y divide-gray-50">
                        {doneItems.map((item) => {
                          const pieces = item.quantity * item.packQuantity;
                          const key = itemKey(group.atelier, item);
                          return (
                            <div key={key} className="flex items-center px-4 py-3 gap-3 opacity-40">
                              <div className="w-14 h-14 bg-emerald-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border border-emerald-100">
                                <CheckCircle2 size={22} className="text-emerald-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-700 truncate line-through">{item.refName}</p>
                                <p className="text-sm text-gray-400">{pieces} pcs · {item.quantity} lot{item.quantity > 1 ? 's' : ''}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setCompletedKeys(prev => { const n = new Set(prev); n.delete(key); return n; })}
                                className="p-1.5 text-gray-400 hover:text-gray-600"
                              >
                                <RotateCcw size={16} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* Total restant */}
          {(() => {
            const remainingPieces = displayProduction.reduce((sum, g) =>
              sum + g.items.filter(i => !completedKeys.has(itemKey(g.atelier, i))).reduce((s, i) => s + i.quantity * i.packQuantity, 0), 0);
            const remainingLots = displayProduction.reduce((sum, g) =>
              sum + g.items.filter(i => !completedKeys.has(itemKey(g.atelier, i))).reduce((s, i) => s + i.quantity, 0), 0);
            const allDone = remainingPieces === 0 && totalPieces > 0;
            return (
              <div className={`rounded-2xl p-5 text-white flex items-center justify-between ${allDone ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
                <div>
                  {allDone ? (
                    <>
                      <p className="text-white/80 text-sm">Production terminée</p>
                      <p className="text-3xl font-black">Tout est prêt !</p>
                      <p className="text-white/60 text-xs mt-1">{totalPieces} pièces produites</p>
                    </>
                  ) : (
                    <>
                      <p className="text-blue-200 text-sm">Reste à produire</p>
                      <p className="text-3xl font-black">{remainingPieces} pièces</p>
                      <p className="text-blue-200 text-xs mt-1">{remainingLots} lot{remainingLots > 1 ? 's' : ''}</p>
                    </>
                  )}
                </div>
                {allDone ? <CheckCircle2 size={40} className="text-white/60" /> : <Package size={40} className="text-blue-300" />}
              </div>
            );
          })()}
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* MODAL CONFIRMATION ARTICLE TERMINÉ */}
      {/* ──────────────────────────────────────── */}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center print:hidden" onClick={() => setConfirmItem(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 pb-8 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Poignée */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
            {/* Icône */}
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Article terminé ?</h2>
            <p className="text-gray-500 text-center text-sm mb-2">
              <span className="font-semibold text-gray-800">{confirmItem.name}</span>
            </p>
            <p className="text-gray-400 text-center text-sm mb-6">
              {confirmItem.pieces} pièce{confirmItem.pieces > 1 ? 's' : ''} produites
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletedKeys(prev => new Set([...prev, confirmItem.key]));
                  setConfirmItem(null);
                }}
                className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm"
              >
                Oui, c'est fait !
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* CONTENU D'IMPRESSION (invisible à l'écran) */}
      {/* ──────────────────────────────────────── */}
      <div id="print-content">
        <div className="print-header">
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px' }}>
            Production du {formatDate(date)}
          </h1>
          <p style={{ color: '#6b7280', margin: '0 0 2px', fontSize: '13px' }}>
            {printAtelierLabel} — {printSlotLabel}
          </p>
          <p style={{ color: '#374151', fontWeight: 600, margin: 0, fontSize: '13px' }}>
            {printTotalItems} lots — {printTotalPieces} pièces à produire
          </p>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Produit</th>
              <th style={{ textAlign: 'left' }}>Atelier</th>
              <th style={{ textAlign: 'left' }}>Format</th>
              <th style={{ textAlign: 'left' }}>État</th>
              <th style={{ textAlign: 'right' }}>Lots</th>
              <th style={{ textAlign: 'right' }}>Pièces</th>
            </tr>
          </thead>
          <tbody>
            {printProduction.flatMap((group) =>
              group.items.map((item, idx) => {
                const stateStyle = getProductStateStyle(item.productState);
                const pieces = item.quantity * item.packQuantity;
                return (
                  <tr key={`${group.atelier}-${idx}`}>
                    <td>
                      <strong>{item.refName}</strong>
                      <span style={{ display: 'block', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{item.refCode}</span>
                    </td>
                    <td>
                      <span style={{ backgroundColor: group.atelierBgColor, color: group.atelierColor, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                        {group.atelierLabel}
                      </span>
                    </td>
                    <td>{getPackLabel(item.packType)} × {item.packQuantity}</td>
                    <td>
                      <span style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color, padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                        {stateStyle.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', color: '#6b7280' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '18px' }}>{pieces}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ fontWeight: 600 }}>Total général</td>
              <td style={{ textAlign: 'right', color: '#6b7280' }}>{printTotalItems} lots</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '18px' }}>{printTotalPieces} pièces</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ──────────────────────────────────────── */}
      {/* MODAL IMPRESSION */}
      {/* ──────────────────────────────────────── */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPrintModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg lg:max-w-5xl flex flex-col" style={{ maxHeight: '90vh' }}>

            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center">
                  <Printer size={18} className="text-white" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Options d'impression</h2>
              </div>
              <button type="button" onClick={() => setShowPrintModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
                <X size={20} />
              </button>
            </div>

            {/* Body : preview gauche + options droite */}
            <div className="flex flex-1 min-h-0">

              {/* ── Prévisualisation A4 — masquée sur mobile ── */}
              <div className="hidden lg:flex w-[380px] flex-shrink-0 bg-gray-300 border-r border-gray-300 flex-col">
                <div className="px-4 py-2.5 border-b border-gray-400 flex-shrink-0 bg-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aperçu A4</p>
                </div>
                <div className="flex-1 overflow-y-auto py-6 px-5 flex justify-center">
                  {/* Feuille A4 mise à l'échelle via zoom */}
                  <div style={{
                    zoom: 0.42,
                    width: '794px',
                    minHeight: '1123px',
                    background: 'white',
                    padding: '48px 48px 64px',
                    boxShadow: '0 4px 32px rgba(0,0,0,0.25)',
                    fontFamily: 'sans-serif',
                    color: '#111827',
                  }}>
                    {/* En-tête */}
                    <div style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: '16px', marginBottom: '20px' }}>
                      <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: '0 0 6px' }}>
                        Production du {formatDate(date)}
                      </h1>
                      <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 3px' }}>{printAtelierLabel} — {printSlotLabel}</p>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: 0 }}>{printTotalItems} lots — {printTotalPieces} pièces à produire</p>
                    </div>

                    {/* Tableau */}
                    {printProduction.length === 0 ? (
                      <p style={{ color: '#9ca3af', textAlign: 'center', padding: '48px 0', fontStyle: 'italic' }}>Aucun article pour cette sélection</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '10px 12px', color: '#6b7280', fontWeight: 500 }}>Produit</th>
                            <th style={{ textAlign: 'left', padding: '10px 12px', color: '#6b7280', fontWeight: 500 }}>Atelier</th>
                            <th style={{ textAlign: 'left', padding: '10px 12px', color: '#6b7280', fontWeight: 500 }}>Format</th>
                            <th style={{ textAlign: 'left', padding: '10px 12px', color: '#6b7280', fontWeight: 500 }}>État</th>
                            <th style={{ textAlign: 'right', padding: '10px 12px', color: '#6b7280', fontWeight: 500 }}>Lots</th>
                            <th style={{ textAlign: 'right', padding: '10px 12px', color: '#6b7280', fontWeight: 500 }}>Pièces</th>
                          </tr>
                        </thead>
                        <tbody>
                          {printProduction.flatMap((group) =>
                            group.items.map((item, idx) => {
                              const stateStyle = getProductStateStyle(item.productState);
                              return (
                                <tr key={`${group.atelier}-${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '10px 12px' }}>
                                    <strong style={{ display: 'block' }}>{item.refName}</strong>
                                    <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{item.refCode}</span>
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <span style={{ backgroundColor: group.atelierBgColor, color: group.atelierColor, padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                                      {group.atelierLabel}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 12px', color: '#4b5563' }}>{getPackLabel(item.packType)} × {item.packQuantity}</td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <span style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                      {stateStyle.label}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{item.quantity}</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px' }}>{item.quantity * item.packQuantity}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                            <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 600, color: '#1e3a8a' }}>Total général</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#3b82f6' }}>{printTotalItems} lots</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#1e3a8a' }}>{printTotalPieces} pièces</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Options ── */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Choix atelier */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Atelier</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${printAtelier === 'all' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}>
                        {printAtelier === 'all' && <Check size={12} className="text-white" />}
                      </div>
                      <input type="radio" className="sr-only" checked={printAtelier === 'all'} onChange={() => setPrintAtelier('all')} />
                      <span className="text-sm font-medium text-gray-700">Tous les ateliers</span>
                      <span className="ml-auto text-sm text-gray-400">
                        {applyFilters(production, 'all', printSlots).reduce((s, g) => s + g.totalQuantity, 0)} art.
                      </span>
                    </label>
                    {production.map((g) => (
                      <label key={g.atelier} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:opacity-90 transition-opacity" style={{ borderColor: g.atelierColor + '40', backgroundColor: g.atelierBgColor }}>
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors" style={{ borderColor: printAtelier === g.atelier ? g.atelierColor : '#d1d5db', backgroundColor: printAtelier === g.atelier ? g.atelierColor : 'white' }}>
                          {printAtelier === g.atelier && <Check size={12} className="text-white" />}
                        </div>
                        <input type="radio" className="sr-only" checked={printAtelier === g.atelier} onChange={() => setPrintAtelier(g.atelier)} />
                        <span className="text-sm font-medium" style={{ color: g.atelierColor }}>{g.atelierLabel}</span>
                        <span className="ml-auto text-sm" style={{ color: g.atelierColor + 'cc' }}>
                          {applyFilters(production, g.atelier, printSlots).reduce((s, gr) => s + gr.totalQuantity, 0)} art.
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Choix créneaux (multi-sélection) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-700">Créneaux</p>
                    {printSlots.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPrintSlots([])}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Tout sélectionner
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {/* Tous */}
                    <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-gray-50 border-gray-200">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${printSlots.length === 0 ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                        {printSlots.length === 0 && <Check size={12} className="text-white" />}
                      </div>
                      <input type="checkbox" className="sr-only" checked={printSlots.length === 0} onChange={() => setPrintSlots([])} />
                      <span className="text-sm font-medium text-gray-700">Tous les créneaux</span>
                      <span className="ml-auto text-xs text-gray-400">{applyFilters(production, printAtelier, []).reduce((s, g) => s + g.totalQuantity, 0)} art.</span>
                    </label>
                    {/* Chaque créneau */}
                    {[...slots].sort((a, b) => a.start_time.localeCompare(b.start_time)).map((slot) => {
                      const checked = printSlots.includes(slot.id);
                      const count = applyFilters(production, printAtelier, [slot.id]).reduce((s, g) => s + g.totalQuantity, 0);
                      return (
                        <label key={slot.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                            {checked && <Check size={12} className="text-white" />}
                          </div>
                          <input type="checkbox" className="sr-only" checked={checked} onChange={() => togglePrintSlot(slot.id)} />
                          <span className="text-sm font-medium text-gray-700">{slot.name}</span>
                          <span className="text-sm text-gray-400">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span>
                          <span className="ml-auto text-xs text-gray-400">{count} art.</span>
                        </label>
                      );
                    })}
                    {/* Sans créneau */}
                    {(() => {
                      const checked = printSlots.includes('none');
                      const count = applyFilters(production, printAtelier, ['none']).reduce((s, g) => s + g.totalQuantity, 0);
                      return (
                        <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                            {checked && <Check size={12} className="text-white" />}
                          </div>
                          <input type="checkbox" className="sr-only" checked={checked} onChange={() => togglePrintSlot('none')} />
                          <span className="text-sm font-medium text-gray-700">Sans créneau</span>
                          <span className="ml-auto text-xs text-gray-400">{count} art.</span>
                        </label>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer modal */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{printTotalItems}</span> lots · <span className="font-semibold text-gray-900">{printTotalPieces}</span> pièces
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPrintModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={printTotalItems === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Printer size={16} />
                  Lancer l'impression
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </>}

      {/* Print styles */}
      <style jsx global>{`
        @media screen {
          #print-content {
            display: none;
          }
        }
        @media print {
          body * {
            visibility: hidden;
          }
          #print-content,
          #print-content * {
            visibility: visible;
          }
          #print-content {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
            font-family: sans-serif;
          }
          .print-header {
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e5e7eb;
          }
          .print-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          .print-table th {
            padding: 6px 16px;
            background: #f9fafb;
            color: #6b7280;
            font-weight: 500;
            border-bottom: 1px solid #e5e7eb;
          }
          .print-table td {
            padding: 8px 16px;
            border-bottom: 1px solid #f3f4f6;
            color: #111827;
          }
          .print-table tfoot td {
            background: #eff6ff;
            border-top: 2px solid #bfdbfe;
            color: #1e3a8a;
            border-bottom: none;
          }
        }
      `}</style>
    </div>
  );
}
