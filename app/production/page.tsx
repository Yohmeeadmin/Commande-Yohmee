'use client';

import { useEffect, useState, useMemo } from 'react';
import { ClipboardList, Calendar, Printer, ChevronLeft, ChevronRight, Package, X, Check, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
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

export default function ProductionPage() {
  const { ateliers, getStyle: getAtelierStyle } = useAteliers();
  const { profile } = useUser();
  const defaultAtelier = profile?.ateliers?.length === 1 ? profile.ateliers[0] : 'all';

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [production, setProduction] = useState<ProductionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAtelier, setSelectedAtelier] = useState<string>(defaultAtelier);
  const [slots, setSlots] = useState<{ id: string; name: string; start_time: string; end_time: string }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'production' | 'rappel'>('production');
  const [rappelOrders, setRappelOrders] = useState<any[]>([]);
  const [rappelLoading, setRappelLoading] = useState(false);

  // Modal impression
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printAtelier, setPrintAtelier] = useState<string>('all');
  const [printSlots, setPrintSlots] = useState<string[]>([]); // vide = tous

  useEffect(() => { loadProduction(); }, [date]);
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
        .gte('delivery_date', today.toISOString().split('T')[0])
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

  async function loadProduction() {
    setLoading(true);
    try {
      // Jour de semaine en français (parsing local pour éviter les décalages UTC)
      const [y, m, d] = date.split('-').map(Number);
      const JOURS_JS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const dayFr = JOURS_JS[new Date(y, m - 1, d).getDay()];

      const [
        { data: orders },
        { data: slotsData },
        { data: recurringData },
        { data: existingRecOrders },
      ] = await Promise.all([
        supabase.from('orders').select('id, delivery_slot_id').eq('delivery_date', date).in('status', ['confirmee', 'production']),
        supabase.from('delivery_slots').select('id, name, start_time, end_time').eq('is_active', true).order('sort_order'),
        supabase.from('recurring_orders').select('id, type_recurrence, jours_semaine, date_debut, date_fin, delivery_slot_id').eq('is_active', true).lte('date_debut', date),
        supabase.from('orders').select('recurring_order_id').eq('delivery_date', date).not('recurring_order_id', 'is', null),
      ]);

      const existingRecIds = new Set((existingRecOrders || []).map((o: any) => o.recurring_order_id));
      const previews = ((recurringData || []) as any[])
        .filter((rec) => {
          if (rec.date_fin && rec.date_fin < date) return false;
          if (rec.type_recurrence === 'hebdo' && !rec.jours_semaine.includes(dayFr)) return false;
          if (existingRecIds.has(rec.id)) return false;
          return true;
        })
        .map((rec) => ({ recurring_order_id: rec.id, delivery_slot_id: rec.delivery_slot_id }));

      setSlots(slotsData || []);

      const productMap = new Map<string, ProductionItem>();

      // --- Commandes réelles ---
      if (orders && orders.length > 0) {
        const slotMap: Record<string, string | null> = {};
        orders.forEach((o: any) => { slotMap[o.id] = o.delivery_slot_id; });

        const { data: items } = await supabase
          .from('order_items')
          .select(`
            order_id,
            quantity_ordered,
            units_total,
            article_unit_quantity,
            product_article:product_articles(
              display_name,
              pack_type,
              quantity,
              product_state,
              product_reference:product_references(name, code, atelier)
            )
          `)
          .in('order_id', orders.map((o: any) => o.id));

        (items || []).forEach((item: any) => {
          const art = item.product_article;
          const ref = art?.product_reference;
          if (!art || !ref) return;
          const slotId = slotMap[item.order_id] ?? null;
          const key = `${ref.code}-${art.pack_type}-${art.quantity}-${art.product_state}-${slotId ?? 'none'}`;
          const existing = productMap.get(key);
          if (existing) {
            existing.quantity += item.quantity_ordered;
            existing.totalUnits += item.units_total || 0;
          } else {
            productMap.set(key, {
              refName: ref.name, refCode: ref.code, atelier: ref.atelier,
              packType: art.pack_type, packQuantity: art.quantity,
              productState: art.product_state, displayName: art.display_name,
              quantity: item.quantity_ordered, totalUnits: item.units_total || 0, slotId,
            });
          }
        });
      }

      // --- Aperçus récurrents (si pas de commande réelle pour ce jour) ---
      if (previews && previews.length > 0) {
        const recurringIds = previews.map((p: any) => p.recurring_order_id);
        const previewSlotMap: Record<string, string | null> = {};
        previews.forEach((p: any) => { previewSlotMap[p.recurring_order_id] = p.delivery_slot_id; });

        const { data: previewItems } = await supabase
          .from('recurring_order_items')
          .select(`
            recurring_order_id,
            quantite,
            product_article:product_articles!product_article_id(
              display_name,
              pack_type,
              quantity,
              product_state,
              product_reference:product_references(name, code, atelier)
            )
          `)
          .in('recurring_order_id', recurringIds);

        (previewItems || []).forEach((item: any) => {
          const art = item.product_article;
          const ref = art?.product_reference;
          if (!art || !ref) return;
          const slotId = previewSlotMap[item.recurring_order_id] ?? null;
          const key = `${ref.code}-${art.pack_type}-${art.quantity}-${art.product_state}-${slotId ?? 'none'}`;
          const existing = productMap.get(key);
          if (existing) {
            existing.quantity += item.quantite;
            existing.totalUnits += item.quantite;
          } else {
            productMap.set(key, {
              refName: ref.name, refCode: ref.code, atelier: ref.atelier,
              packType: art.pack_type, packQuantity: art.quantity,
              productState: art.product_state, displayName: art.display_name,
              quantity: item.quantite, totalUnits: item.quantite, slotId,
            });
          }
        });
      }

      if (productMap.size === 0) {
        setProduction([]);
        setLoading(false);
        return;
      }

      // Grouper par atelier
      const atelierMap = new Map<string, ProductionItem[]>();
      productMap.forEach((item) => {
        const existing = atelierMap.get(item.atelier) || [];
        existing.push(item);
        atelierMap.set(item.atelier, existing);
      });

      const groups: ProductionGroup[] = Array.from(atelierMap.entries())
        .map(([atelier, items]) => {
          const style = getAtelierStyle(atelier);
          return {
            atelier,
            atelierLabel: style.label,
            atelierColor: style.color,
            atelierBgColor: style.bgColor,
            items: items.sort((a, b) => a.refName.localeCompare(b.refName)),
            totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
          };
        })
        .sort((a, b) => a.atelierLabel.localeCompare(b.atelierLabel));

      setProduction(groups);
    } catch (error) {
      console.error('Erreur chargement production:', error);
    } finally {
      setLoading(false);
    }
  }

  const changeDate = (days: number) => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + days);
    setDate(newDate.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setDate(new Date().toISOString().split('T')[0]);
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
      </div>

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
      <div className="grid grid-cols-2 gap-3 print:hidden">
        <div className="bg-blue-600 rounded-2xl p-4 text-white">
          <p className="text-blue-200 text-xs font-medium uppercase tracking-wide mb-1">Pièces</p>
          <p className="text-4xl font-black leading-none">{totalPieces}</p>
          <p className="text-blue-200 text-xs mt-2">à produire</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Lots</p>
          <p className="text-4xl font-black text-gray-900 leading-none">{totalItems}</p>
          <p className="text-gray-400 text-xs mt-2">commandes</p>
        </div>
      </div>

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
          {displayProduction.map((group) => (
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
                  {group.items.reduce((s, i) => s + i.quantity * i.packQuantity, 0)} pièces
                </span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-gray-50">
                {group.items.map((item, idx) => {
                  const stateStyle = getProductStateStyle(item.productState);
                  const pieces = item.quantity * item.packQuantity;
                  return (
                    <div key={idx} className="flex items-center px-4 py-3 gap-3">
                      {/* Pièces — dominant */}
                      <div className="w-14 h-14 bg-gray-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border border-gray-100">
                        <span className="text-2xl font-black text-gray-900 leading-none">{pieces}</span>
                        <span className="text-gray-400 text-xs mt-0.5">pcs</span>
                      </div>
                      {/* Infos produit */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{item.refName}</p>
                        <p className="text-sm text-gray-500">{getPackLabel(item.packType)} × {item.packQuantity}</p>
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}>
                          {stateStyle.label}
                        </span>
                      </div>
                      {/* Lots */}
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold text-gray-400">{item.quantity}</span>
                        <p className="text-xs text-gray-300">lot{item.quantity > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Total */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">Total à produire</p>
              <p className="text-3xl font-black">{totalPieces} pièces</p>
              <p className="text-blue-200 text-xs mt-1">{totalItems} lot{totalItems > 1 ? 's' : ''}</p>
            </div>
            <Package size={40} className="text-blue-300" />
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '90vh' }}>

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

              {/* ── Prévisualisation A4 ── */}
              <div className="w-[380px] flex-shrink-0 bg-gray-300 border-r border-gray-300 flex flex-col">
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
