'use client';

import { useState, useMemo } from 'react';
import { X, Search, ChevronDown, ChevronUp, AlertTriangle, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Driver, driverFullName } from '@/types';
import { formatPrice } from '@/lib/utils';
import { DeliveryRouteWithDetails, RouteStatus } from '@/types/delivery-routes';

// ── Types locaux (alignés sur livraisons/page.tsx) ────────────────────────────

interface Slot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
}

interface OrderForRoute {
  id: string;
  numero: string;
  status: string;
  total: number;
  note: string | null;
  client: { nom: string; telephone: string | null; adresse_livraison: string | null } | null;
  delivery_slot: Slot | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateRouteModalProps {
  date: string;
  initialSlot: Slot | null;
  slots: Slot[];
  drivers: Driver[];
  /** Toutes les commandes du jour (sauf annulées) */
  allOrders: OrderForRoute[];
  /** Tournées déjà créées pour ce jour — pour filtrer les commandes déjà assignées */
  existingRoutes: DeliveryRouteWithDetails[];
  onClose: () => void;
  onCreated: (route: DeliveryRouteWithDetails) => void;
}

function slotLabel(s: Slot) {
  return `${s.name} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateRouteModal({
  date,
  initialSlot,
  slots,
  drivers,
  allOrders,
  existingRoutes,
  onClose,
  onCreated,
}: CreateRouteModalProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(initialSlot?.id ?? null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showOutOfSlot, setShowOutOfSlot] = useState(false);
  const [outOfSlotSearch, setOutOfSlotSearch] = useState('');
  const [pendingOutOfSlotId, setPendingOutOfSlotId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────────

  // IDs commandes déjà dans une tournée active
  const routedOrderIds = useMemo(
    () => new Set(existingRoutes.flatMap(r => r.route_orders.map(ro => ro.order_id))),
    [existingRoutes],
  );

  // Commandes du créneau sélectionné, non routées, non livrées
  const suggestedOrders = useMemo(
    () =>
      allOrders.filter(o => {
        if (routedOrderIds.has(o.id)) return false;
        if (selectedSlotId === null) return !o.delivery_slot;
        return o.delivery_slot?.id === selectedSlotId;
      }),
    [allOrders, selectedSlotId, routedOrderIds],
  );

  // Commandes hors créneau, non routées
  const outOfSlotOrders = useMemo(
    () =>
      allOrders.filter(o => {
        if (routedOrderIds.has(o.id)) return false;
        const sameSlot =
          selectedSlotId === null ? !o.delivery_slot : o.delivery_slot?.id === selectedSlotId;
        if (sameSlot) return false;
        if (outOfSlotSearch) {
          return o.client?.nom?.toLowerCase().includes(outOfSlotSearch.toLowerCase());
        }
        return true;
      }),
    [allOrders, selectedSlotId, routedOrderIds, outOfSlotSearch],
  );

  const selectedOrders = allOrders.filter(o => selectedOrderIds.has(o.id));
  const totalCA = selectedOrders.reduce((s, o) => s + o.total, 0);
  const panierMoy = selectedOrders.length > 0 ? totalCA / selectedOrders.length : 0;
  const outOfSlotSelected = selectedOrders.filter(o => {
    const sameSlot =
      selectedSlotId === null ? !o.delivery_slot : o.delivery_slot?.id === selectedSlotId;
    return !sameSlot;
  }).length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function toggleSuggested(orderId: string) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function requestOutOfSlot(orderId: string) {
    if (selectedOrderIds.has(orderId)) {
      setSelectedOrderIds(prev => { const n = new Set(prev); n.delete(orderId); return n; });
    } else {
      setPendingOutOfSlotId(orderId);
    }
  }

  function confirmOutOfSlot() {
    if (!pendingOutOfSlotId) return;
    setSelectedOrderIds(prev => new Set([...prev, pendingOutOfSlotId]));
    setPendingOutOfSlotId(null);
  }

  function selectAll() {
    setSelectedOrderIds(prev => new Set([...prev, ...suggestedOrders.map(o => o.id)]));
  }

  async function handleCreate() {
    if (!selectedDriverId || selectedOrderIds.size === 0) return;
    setSaving(true);
    try {
      const routeNumber = `T-${date.replace(/-/g, '')}-${String(existingRoutes.length + 1).padStart(3, '0')}`;

      const { data: route, error: routeError } = await supabase
        .from('delivery_routes')
        .insert({
          route_number:     routeNumber,
          delivery_date:    date,
          delivery_slot_id: selectedSlotId ?? null,
          driver_id:        selectedDriverId,
          status:           'assigned' as RouteStatus,
          total_orders:     selectedOrderIds.size,
          total_revenue:    totalCA,
          notes:            notes.trim() || null,
        })
        .select(`
          id, route_number, delivery_date, delivery_slot_id, driver_id, status,
          total_orders, total_revenue, notes, started_at, completed_at, created_at, updated_at,
          driver:drivers(first_name, last_name, phone)
        `)
        .single();

      if (routeError || !route) throw routeError ?? new Error('Création tournée échouée');

      const payload = [...selectedOrderIds].map((orderId, idx) => {
        const order = allOrders.find(o => o.id === orderId)!;
        const isOutOfSlot =
          selectedSlotId === null
            ? !!order.delivery_slot
            : order.delivery_slot?.id !== selectedSlotId;
        return {
          route_id:               route.id,
          order_id:               orderId,
          delivery_order_index:   idx + 1,
          order_amount_snapshot:  order.total,
          original_slot_id:       order.delivery_slot?.id ?? null,
          is_out_of_slot:         isOutOfSlot,
          status:                 'pending',
        };
      });

      const { data: routeOrders, error: roError } = await supabase
        .from('delivery_route_orders')
        .insert(payload)
        .select();

      if (roError) throw roError;

      onCreated({ ...route, route_orders: routeOrders ?? [] } as DeliveryRouteWithDetails);
    } catch (err) {
      console.error('Erreur création tournée:', err);
    } finally {
      setSaving(false);
    }
  }

  const canCreate = selectedDriverId !== '' && selectedOrderIds.size > 0;
  const pendingOrder = pendingOutOfSlotId ? allOrders.find(o => o.id === pendingOutOfSlotId) : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:w-full lg:max-w-xl"
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Créer une tournée</h2>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">
              {new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-6">

            {/* ── Créneau ───────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Créneau de la tournée
              </p>
              <div className="flex flex-wrap gap-2">
                {slots.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSlotId(s.id); setSelectedOrderIds(new Set()); }}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      selectedSlotId === s.id
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {slotLabel(s)}
                  </button>
                ))}
                <button
                  onClick={() => { setSelectedSlotId(null); setSelectedOrderIds(new Set()); }}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    selectedSlotId === null
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Sans créneau
                </button>
              </div>
            </div>

            {/* ── Chauffeur ─────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Chauffeur <span className="text-red-400">*</span>
              </p>
              {drivers.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun chauffeur actif</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {drivers.map(d => {
                    const selected = selectedDriverId === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDriverId(d.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {d.first_name.charAt(0)}{d.last_name.charAt(0)}
                        </span>
                        {driverFullName(d)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Section 1 : Commandes suggérées ───────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Commandes du créneau
                  <span className="ml-1.5 text-gray-400 font-normal normal-case">
                    ({suggestedOrders.length})
                  </span>
                </p>
                {suggestedOrders.length > 1 && (
                  <button
                    onClick={selectAll}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    Tout sélectionner
                  </button>
                )}
              </div>

              {suggestedOrders.length === 0 ? (
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-400">
                    Aucune commande disponible pour ce créneau
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestedOrders.map(order => {
                    const selected = selectedOrderIds.has(order.id);
                    return (
                      <button
                        key={order.id}
                        onClick={() => toggleSuggested(order.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          selected
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-100 bg-white hover:border-gray-200'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        }`}>
                          {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">
                            {order.client?.nom ?? '—'}
                          </p>
                          {order.client?.adresse_livraison && (
                            <p className="text-xs text-gray-400 truncate">
                              {order.client.adresse_livraison}
                            </p>
                          )}
                          {order.note && (
                            <p className="text-xs text-amber-600 mt-0.5">⚠️ {order.note}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-900">{formatPrice(order.total)}</p>
                          <p className="text-xs text-gray-400">{order.numero}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Section 2 : Hors créneau ──────────────────────────────── */}
            <div>
              <button
                onClick={() => setShowOutOfSlot(h => !h)}
                className="w-full flex items-center justify-between py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  Ajouter hors créneau
                  {outOfSlotSelected > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                      {outOfSlotSelected} ajoutée{outOfSlotSelected > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                {showOutOfSlot ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showOutOfSlot && (
                <div className="space-y-3 mt-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Rechercher un client…"
                      value={outOfSlotSearch}
                      onChange={e => setOutOfSlotSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition-colors"
                    />
                  </div>

                  {outOfSlotOrders.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">
                      Aucune autre commande disponible
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {outOfSlotOrders.map(order => {
                        const selected = selectedOrderIds.has(order.id);
                        return (
                          <button
                            key={order.id}
                            onClick={() => requestOutOfSlot(order.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                              selected
                                ? 'border-amber-400 bg-amber-50'
                                : 'border-gray-100 bg-white hover:border-amber-200'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              selected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                            }`}>
                              {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">
                                {order.client?.nom ?? '—'}
                              </p>
                              <p className="text-xs text-amber-600 font-medium">
                                Créneau initial :{' '}
                                {order.delivery_slot
                                  ? slotLabel(order.delivery_slot)
                                  : 'Sans créneau'}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-gray-900 shrink-0">
                              {formatPrice(order.total)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Notes ─────────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Notes (optionnel)
              </p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Instructions pour le chauffeur…"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-blue-400 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* ── Footer : résumé + bouton ───────────────────────────────────── */}
        <div
          className="border-t border-gray-100 px-5 py-4 shrink-0 space-y-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}
        >
          {selectedOrderIds.size > 0 && (
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <div className="text-center">
                <p className="text-xl font-black text-gray-900 leading-none">{selectedOrderIds.size}</p>
                <p className="text-xs text-gray-400 mt-0.5">commandes</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-sm font-black text-gray-900 leading-none">{formatPrice(totalCA)}</p>
                <p className="text-xs text-gray-400 mt-0.5">CA total</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-sm font-black text-gray-900 leading-none">{formatPrice(panierMoy)}</p>
                <p className="text-xs text-gray-400 mt-0.5">panier moy.</p>
              </div>
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!canCreate || saving}
            className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors text-sm"
          >
            {saving
              ? 'Création…'
              : selectedOrderIds.size > 0
                ? `Créer la tournée (${selectedOrderIds.size} commande${selectedOrderIds.size > 1 ? 's' : ''})`
                : 'Sélectionner des commandes'}
          </button>
        </div>
      </div>

      {/* ── Confirmation hors créneau ──────────────────────────────────────── */}
      {pendingOrder && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[60]"
            onClick={() => setPendingOutOfSlotId(null)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] bg-white rounded-2xl shadow-2xl p-5 max-w-sm mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Commande hors créneau</p>
                <p className="text-xs text-gray-400">Confirmation requise</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-1">
              <strong>{pendingOrder.client?.nom ?? pendingOrder.numero}</strong> est prévu pour :
            </p>
            <p className="text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-2 rounded-xl mb-3">
              {pendingOrder.delivery_slot
                ? slotLabel(pendingOrder.delivery_slot)
                : 'Sans créneau'}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Le créneau initial est conservé pour la traçabilité analytique. Cette commande sera
              marquée <em>hors créneau</em> dans les rapports.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setPendingOutOfSlotId(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmOutOfSlot}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
