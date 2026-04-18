'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, Printer, Settings,
  GripVertical, CheckCircle, Phone, MapPin, Package, UserCircle, Plus,
  X, ChevronUp, ChevronDown, ChevronsUpDown, Navigation,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Driver, driverFullName, driverInitials } from '@/types';
import { formatPrice, localDateStr } from '@/lib/utils';
import CreateRouteModal from '@/components/livraisons/CreateRouteModal';
import { ROUTE_STATUSES, DeliveryRouteWithDetails } from '@/types/delivery-routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Slot { id: string; name: string; start_time: string; end_time: string; sort_order: number; }

interface OrderItem {
  id: string;
  product_article_id: string;
  quantity_ordered: number;
  quantity_delivered: number | null;
  unit_price: number;
  article_unit_quantity: number;
  product_article: { display_name: string } | null;
}

interface DeliveryOrder {
  id: string;
  numero: string;
  status: string;
  is_fully_delivered: boolean | null;
  total: number;
  note: string | null;
  driver_id: string | null;
  driver_sequence: number | null;
  client: { nom: string; telephone: string | null; adresse_livraison: string | null } | null;
  delivery_slot: Slot | null;
  items: OrderItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function offsetDate(base: string, days: number) {
  const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + days);
  return localDateStr(d);
}
function formatDateLabel(s: string) {
  const today = localDateStr();
  if (s === today) return "Aujourd'hui";
  if (s === offsetDate(today, 1)) return 'Demain';
  if (s === offsetDate(today, -1)) return 'Hier';
  return new Date(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function slotLabel(s: Slot) {
  return `${s.name} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
}

const DRIVER_COLORS = [
  { bg: '#DBEAFE', text: '#1E40AF', ring: '#93C5FD' },
  { bg: '#D1FAE5', text: '#065F46', ring: '#6EE7B7' },
  { bg: '#EDE9FE', text: '#5B21B6', ring: '#C4B5FD' },
  { bg: '#FEF3C7', text: '#92400E', ring: '#FCD34D' },
];

// ─── RouteCard ────────────────────────────────────────────────────────────────

function RouteCard({
  route,
  orders,
  onCancelled,
}: {
  route: DeliveryRouteWithDetails;
  orders: DeliveryOrder[];
  onCancelled?: (routeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const statusInfo = ROUTE_STATUSES.find(s => s.value === route.status);
  const routeOrders = route.route_orders
    .slice()
    .sort((a, b) => (a.delivery_order_index ?? 0) - (b.delivery_order_index ?? 0))
    .map(ro => ({ ro, order: orders.find(o => o.id === ro.order_id) }))
    .filter((x): x is { ro: typeof route.route_orders[0]; order: DeliveryOrder } => !!x.order);

  const delivered = routeOrders.filter(({ order }) => order.status === 'livree').length;
  const total = routeOrders.length;
  const outOfSlot = route.route_orders.filter(ro => ro.is_out_of_slot).length;
  const panierMoyen = route.total_orders > 0 ? route.total_revenue / route.total_orders : 0;

  async function handleCancel() {
    if (!confirm('Annuler cette tournée ? Les commandes seront libérées.')) return;
    setCancelling(true);
    await supabase.from('delivery_routes').update({ status: 'cancelled' }).eq('id', route.id);
    onCancelled?.(route.id);
    setCancelling(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
      {/* Header — cliquable pour ouvrir/fermer */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-blue-50/60 border-b border-blue-100 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <Navigation size={14} className="text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-gray-900 text-sm leading-none">{route.route_number}</p>
            {route.driver && (
              <p className="text-xs text-gray-500">· {route.driver.first_name} {route.driver.last_name}</p>
            )}
          </div>
          {total > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(delivered / total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-blue-600 font-semibold whitespace-nowrap">{delivered}/{total}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: statusInfo?.bgColor, color: statusInfo?.color }}
          >
            {statusInfo?.label}
          </span>
          <span className="text-xs text-gray-400 font-medium">{formatPrice(route.total_revenue)}</span>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {/* Contenu développé */}
      {expanded && (
        <div>
          {/* Stats */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 flex-wrap">
            <span>{route.total_orders} arrêt{route.total_orders !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>Panier moy. <strong className="text-gray-700">{formatPrice(panierMoyen)}</strong></span>
            {outOfSlot > 0 && (
              <>
                <span>·</span>
                <span className="text-amber-600">⚠ {outOfSlot} hors créneau</span>
              </>
            )}
          </div>

          {/* Liste des commandes */}
          <div className="divide-y divide-gray-50">
            {routeOrders.map(({ ro, order }, idx) => {
              const isDelivered = order.status === 'livree';
              return (
                <div key={ro.id} className={`flex items-start gap-3 px-4 py-3 ${isDelivered ? 'opacity-50' : ''}`}>
                  <span className="text-xs font-bold text-gray-400 w-4 shrink-0 pt-0.5">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className={`font-semibold text-sm ${isDelivered ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {order.client?.nom ?? order.numero}
                      </p>
                      {isDelivered && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Livré</span>
                      )}
                      {ro.is_out_of_slot && (
                        <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">Hors créneau</span>
                      )}
                    </div>
                    {order.client?.telephone && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Phone size={9} /> {order.client.telephone}
                      </p>
                    )}
                    {order.client?.adresse_livraison && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={9} /> {order.client.adresse_livraison}
                      </p>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-gray-700 shrink-0 pt-0.5">{formatPrice(order.total)}</p>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            {route.driver_id ? (
              <Link href={`/chauffeur/${route.driver_id}?routeId=${route.id}`} className="text-xs text-blue-600 font-medium hover:underline">
                Vue chauffeur →
              </Link>
            ) : <span />}
            <button
              onClick={e => { e.stopPropagation(); handleCancel(); }}
              disabled={cancelling}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-40"
            >
              {cancelling ? 'Annulation…' : 'Annuler la tournée'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LivraisonsPage() {
  const todayStr = localDateStr();
  const [date, setDate] = useState(todayStr);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<DeliveryOrder | null>(null);
  const [deliveryQtys, setDeliveryQtys] = useState<Record<string, number>>({});
  const [deliveryStep, setDeliveryStep] = useState<1 | 2>(1);
  const [backorderDate, setBackorderDate] = useState('');
  const [backorderSlotId, setBackorderSlotId] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printDriverIds, setPrintDriverIds] = useState<Set<string>>(new Set());
  const [printSlotIds, setPrintSlotIds] = useState<Set<string>>(new Set(['all']));
  const [previewIndex, setPreviewIndex] = useState(0);

  // ── Tournées ─────────────────────────────────────────────────────────────
  const [routes, setRoutes] = useState<DeliveryRouteWithDetails[]>([]);
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [createRouteInitialSlot, setCreateRouteInitialSlot] = useState<Slot | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    try {
      await supabase.rpc('generate_orders_from_recurring', { target_date: d });

      const [{ data: driversData }, { data: slotsData }, { data: ordersData }, { data: routesData }] = await Promise.all([
        supabase.from('drivers').select('*').eq('is_active', true).order('first_name'),
        supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('orders').select(`
          id, numero, status, is_fully_delivered, total, note, driver_id, driver_sequence,
          client:clients(nom, telephone, adresse_livraison),
          delivery_slot:delivery_slots(id, name, start_time, end_time, sort_order),
          items:order_items(id, product_article_id, quantity_ordered, quantity_delivered, unit_price, article_unit_quantity, product_article:product_articles(display_name))
        `)
          .eq('delivery_date', d)
          .not('status', 'eq', 'annulee')
          .order('driver_sequence', { ascending: true, nullsFirst: false }),
        supabase.from('delivery_routes').select(`
          id, route_number, delivery_date, delivery_slot_id, driver_id, status,
          total_orders, total_revenue, notes, started_at, completed_at, created_at, updated_at,
          driver:drivers(first_name, last_name, phone),
          route_orders:delivery_route_orders(
            id, route_id, order_id, assigned_at, delivery_order_index,
            order_amount_snapshot, original_slot_id, is_out_of_slot, status, created_at
          )
        `)
          .eq('delivery_date', d)
          .not('status', 'eq', 'cancelled'),
      ]);

      setDrivers(driversData || []);
      setSlots(slotsData || []);
      setOrders((ordersData as DeliveryOrder[]) || []);
      setRoutes((routesData as DeliveryRouteWithDetails[]) || []);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => { loadData(date); }, [date, loadData]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function assignDriver(orderId: string, driverId: string | null) {
    let seq: number | null = null;
    if (driverId) {
      const order = orders.find(o => o.id === orderId);
      const peers = orders.filter(o =>
        o.driver_id === driverId &&
        o.delivery_slot?.id === order?.delivery_slot?.id &&
        o.id !== orderId
      );
      seq = peers.length + 1;
    }
    await supabase.from('orders').update({ driver_id: driverId, driver_sequence: seq }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, driver_id: driverId, driver_sequence: seq } : o));
    setAssigningId(null);
  }

  function openDeliveryModal(order: DeliveryOrder) {
    const qtys: Record<string, number> = {};
    order.items.forEach(item => { qtys[item.id] = item.quantity_ordered; });
    setDeliveryQtys(qtys);
    setDeliveryStep(1);
    setBackorderDate(offsetDate(localDateStr(), 1));
    setBackorderSlotId(order.delivery_slot?.id ?? null);
    setDeliveryOrder(order);
  }

  function closeDeliveryModal() {
    setDeliveryOrder(null);
    setDeliveryStep(1);
  }

  async function confirmFullDelivery() {
    if (!deliveryOrder) return;
    await supabase.rpc('mark_order_delivered', {
      p_order_id: deliveryOrder.id,
      p_is_fully_delivered: true,
      p_delivered_items: null,
    });
    setOrders(prev => prev.map(o =>
      o.id === deliveryOrder.id
        ? { ...o, status: 'livree', is_fully_delivered: true,
            items: o.items.map(item => ({ ...item, quantity_delivered: item.quantity_ordered })) }
        : o
    ));
    closeDeliveryModal();
  }

  function goToBackorderStep() { setDeliveryStep(2); }

  async function confirmPartialWithBackorder(createBackorder: boolean) {
    if (!deliveryOrder) return;
    const deliveredItems = deliveryOrder.items.map(item => ({
      order_item_id: item.id,
      quantity_delivered: deliveryQtys[item.id] ?? item.quantity_ordered,
    }));
    await supabase.rpc('mark_order_delivered', {
      p_order_id: deliveryOrder.id,
      p_is_fully_delivered: false,
      p_delivered_items: deliveredItems,
    });
    setOrders(prev => prev.map(o =>
      o.id === deliveryOrder.id
        ? { ...o, status: 'livree', is_fully_delivered: false,
            items: o.items.map(item => ({ ...item, quantity_delivered: deliveryQtys[item.id] ?? item.quantity_ordered })) }
        : o
    ));

    if (createBackorder) {
      const remainingItems = deliveryOrder.items
        .filter(item => (deliveryQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered)
        .map(item => ({
          product_article_id: item.product_article_id,
          quantity: item.quantity_ordered - (deliveryQtys[item.id] ?? item.quantity_ordered),
          unit_price: item.unit_price,
          article_unit_quantity: item.article_unit_quantity,
        }));
      if (remainingItems.length > 0) {
        const { data: newOrderId } = await supabase.rpc('create_backorder', {
          p_parent_order_id: deliveryOrder.id,
          p_new_delivery_date: backorderDate,
          p_items: remainingItems,
        });
        if (newOrderId && backorderSlotId !== deliveryOrder.delivery_slot?.id) {
          await supabase.from('orders').update({ delivery_slot_id: backorderSlotId }).eq('id', newOrderId);
        }
      }
    }
    closeDeliveryModal();
  }

  async function handleDrop(driverOrders: DeliveryOrder[], targetId: string) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    const from = driverOrders.findIndex(o => o.id === draggedId);
    const to = driverOrders.findIndex(o => o.id === targetId);
    if (from === -1 || to === -1) return;

    const reordered = [...driverOrders];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    setOrders(prev => {
      const updated = [...prev];
      reordered.forEach((o, i) => {
        const idx = updated.findIndex(u => u.id === o.id);
        if (idx !== -1) updated[idx] = { ...updated[idx], driver_sequence: i + 1 };
      });
      return updated;
    });
    setDraggedId(null); setDragOverId(null);

    await Promise.all(reordered.map(o => supabase.from('orders').update({ driver_sequence: null }).eq('id', o.id)));
    await Promise.all(reordered.map((o, i) => supabase.from('orders').update({ driver_sequence: i + 1 }).eq('id', o.id)));
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const filteredOrders = orders.filter(o => {
    if (selectedSlot) {
      if (selectedSlot === 'none' && o.delivery_slot) return false;
      if (selectedSlot !== 'none' && o.delivery_slot?.id !== selectedSlot) return false;
    }
    if (selectedDriver) {
      if (selectedDriver === 'none' && o.driver_id) return false;
      if (selectedDriver !== 'none' && o.driver_id !== selectedDriver) return false;
    }
    return true;
  });

  const activeOrders = filteredOrders.filter(o => o.status !== 'livree');
  const deliveredOrders = filteredOrders.filter(o => o.status === 'livree');

  const activeSlotIds = new Set(orders.map(o => o.delivery_slot?.id ?? 'none'));
  const visibleSlots = slots.filter(s => activeSlotIds.has(s.id));
  const hasNoSlot = activeSlotIds.has('none');

  const slotGroups: { key: string; slot: Slot | null; driverGroups: { driver: Driver | null; driverIdx: number; orders: DeliveryOrder[] }[] }[] = [];

  function buildSlotGroup(slot: Slot | null) {
    const slotId = slot?.id ?? null;
    const slotOrders = activeOrders.filter(o =>
      slotId === null ? !o.delivery_slot : o.delivery_slot?.id === slotId
    );
    if (slotOrders.length === 0) return null;

    const driverGroups: typeof slotGroups[0]['driverGroups'] = [];
    drivers.forEach((driver, idx) => {
      const dOrders = slotOrders
        .filter(o => o.driver_id === driver.id)
        .sort((a, b) => (a.driver_sequence ?? 999) - (b.driver_sequence ?? 999));
      if (dOrders.length > 0) driverGroups.push({ driver, driverIdx: idx, orders: dOrders });
    });
    const unassigned = slotOrders.filter(o => !o.driver_id);
    if (unassigned.length > 0) driverGroups.push({ driver: null, driverIdx: -1, orders: unassigned });

    return { key: slot?.id ?? 'none', slot, driverGroups };
  }

  if (!selectedSlot) {
    visibleSlots.forEach(s => { const g = buildSlotGroup(s); if (g) slotGroups.push(g); });
    if (hasNoSlot) { const g = buildSlotGroup(null); if (g) slotGroups.push(g); }
  } else if (selectedSlot === 'none') {
    const g = buildSlotGroup(null); if (g) slotGroups.push(g);
  } else {
    const s = slots.find(s => s.id === selectedSlot) ?? null;
    const g = buildSlotGroup(s); if (g) slotGroups.push(g);
  }

  const totalOrders = filteredOrders.length;
  const livrees = deliveredOrders.length;

  // Map orderId → infos tournée (pour badges)
  const routedOrderMap = useMemo(() => {
    const map = new Map<string, { routeNumber: string; driverName: string; routeId: string }>();
    const activeStatuses = new Set(['draft', 'assigned', 'in_progress', 'partially_delivered']);
    routes.forEach(route => {
      if (!activeStatuses.has(route.status)) return;
      const driverName = route.driver
        ? `${route.driver.first_name} ${route.driver.last_name}`
        : '';
      route.route_orders.forEach(ro => {
        if (ro.status !== 'cancelled') {
          map.set(ro.order_id, { routeNumber: route.route_number, driverName, routeId: route.id });
        }
      });
    });
    return map;
  }, [routes]);

  // ── Print ────────────────────────────────────────────────────────────────────

  function openPrintModal() {
    const driverIdsWithOrders = new Set(orders.filter(o => o.driver_id).map(o => o.driver_id!));
    // Si aucun chauffeur assigné, sélectionner les non-assignés par défaut
    if (driverIdsWithOrders.size === 0 && orders.some(o => !o.driver_id)) {
      driverIdsWithOrders.add('unassigned');
    }
    setPrintDriverIds(driverIdsWithOrders);
    setPrintSlotIds(new Set(['all']));
    setPreviewIndex(0);
    setShowPrintModal(true);
  }

  function executePrint() {
    setShowPrintModal(false);
    setTimeout(() => window.print(), 50);
  }

  function togglePrintDriver(driverId: string) {
    setPrintDriverIds(prev => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId); else next.add(driverId);
      return next;
    });
  }

  function togglePrintSlot(slotId: string) {
    setPrintSlotIds(prev => {
      if (slotId === 'all') return new Set(['all']);
      const next = new Set(prev);
      next.delete('all');
      if (next.has(slotId)) next.delete(slotId); else next.add(slotId);
      if (next.size === 0) return new Set(['all']);
      return next;
    });
  }

  function getPrintOrders(driverId: string) {
    const filtered = driverId === 'unassigned'
      ? orders.filter(o => !o.driver_id)
      : orders.filter(o => o.driver_id === driverId);
    return filtered
      .filter(o => printSlotIds.has('all') || printSlotIds.has(o.delivery_slot?.id ?? 'none'))
      .sort((a, b) => {
        const slotA = a.delivery_slot?.start_time ?? '99:99';
        const slotB = b.delivery_slot?.start_time ?? '99:99';
        if (slotA !== slotB) return slotA.localeCompare(slotB);
        return (a.driver_sequence ?? 999) - (b.driver_sequence ?? 999);
      });
  }

  const printStopCount = [...printDriverIds].reduce((acc, dId) => acc + getPrintOrders(dId).length, 0);
  const hasUnassignedOrders = orders.some(o => !o.driver_id);

  function openCreateRoute(slot: Slot | null) {
    setCreateRouteInitialSlot(slot);
    setShowCreateRoute(true);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; top: 0; left: 0; width: 100%; }
          .print-page-break { page-break-before: always; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Zone imprimable */}
      <div className="print-area hidden">
        {drivers.filter(d => printDriverIds.has(d.id)).map((driver, dIdx) => {
          const driverOrders = getPrintOrders(driver.id);
          if (driverOrders.length === 0) return null;
          return (
            <div key={driver.id} className={dIdx > 0 ? 'print-page-break' : ''} style={{ fontFamily: 'Arial, sans-serif', padding: '24px', maxWidth: '700px' }}>
              <div style={{ borderBottom: '2px solid #111', paddingBottom: '12px', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                  Feuille de route — {driverFullName(driver)}
                </h1>
                <p style={{ fontSize: '13px', color: '#555', margin: '4px 0 0' }}>
                  {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {driver.phone ? `  ·  ${driver.phone}` : ''}
                </p>
              </div>
              {driverOrders.map((order, stopIdx) => (
                <div key={order.id} style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 'bold', minWidth: '24px' }}>#{stopIdx + 1}</span>
                    <span style={{ fontSize: '15px', fontWeight: 'bold' }}>{order.client?.nom ?? '—'}</span>
                    {order.delivery_slot && (
                      <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: 'auto' }}>
                        {order.delivery_slot.name} {order.delivery_slot.start_time.slice(0, 5)}–{order.delivery_slot.end_time.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  {order.client?.telephone && <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 2px 34px' }}>📞 {order.client.telephone}</p>}
                  {order.client?.adresse_livraison && <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 6px 34px' }}>📍 {order.client.adresse_livraison}</p>}
                  {order.note && <p style={{ fontSize: '12px', color: '#d97706', margin: '2px 0 6px 34px' }}>⚠️ {order.note}</p>}
                  <ul style={{ margin: '4px 0 0 34px', padding: 0, listStyle: 'none' }}>
                    {order.items.map(item => (
                      <li key={item.id} style={{ fontSize: '13px', color: '#111', padding: '2px 0' }}>
                        • {item.product_article?.display_name ?? '—'} &times; <strong>{item.quantity_ordered}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                {driverOrders.length} arrêt{driverOrders.length > 1 ? 's' : ''} · Imprimé le {new Date().toLocaleDateString('fr-FR')}
              </p>
            </div>
          );
        })}

        {/* Commandes sans chauffeur */}
        {printDriverIds.has('unassigned') && (() => {
          const unassignedOrders = getPrintOrders('unassigned');
          if (unassignedOrders.length === 0) return null;
          const hasDriverPages = drivers.filter(d => printDriverIds.has(d.id) && getPrintOrders(d.id).length > 0).length > 0;
          return (
            <div className={hasDriverPages ? 'print-page-break' : ''} style={{ fontFamily: 'Arial, sans-serif', padding: '24px', maxWidth: '700px' }}>
              <div style={{ borderBottom: '2px solid #111', paddingBottom: '12px', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                  Livraisons — Sans chauffeur assigné
                </h1>
                <p style={{ fontSize: '13px', color: '#555', margin: '4px 0 0' }}>
                  {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              {unassignedOrders.map((order, stopIdx) => (
                <div key={order.id} style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 'bold', minWidth: '24px' }}>#{stopIdx + 1}</span>
                    <span style={{ fontSize: '15px', fontWeight: 'bold' }}>{order.client?.nom ?? '—'}</span>
                    {order.delivery_slot && (
                      <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: 'auto' }}>
                        {order.delivery_slot.name} {order.delivery_slot.start_time.slice(0, 5)}–{order.delivery_slot.end_time.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  {order.client?.telephone && <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 2px 34px' }}>📞 {order.client.telephone}</p>}
                  {order.client?.adresse_livraison && <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 6px 34px' }}>📍 {order.client.adresse_livraison}</p>}
                  {order.note && <p style={{ fontSize: '12px', color: '#d97706', margin: '2px 0 6px 34px' }}>⚠️ {order.note}</p>}
                  <ul style={{ margin: '4px 0 0 34px', padding: 0, listStyle: 'none' }}>
                    {order.items.map(item => (
                      <li key={item.id} style={{ fontSize: '13px', color: '#111', padding: '2px 0' }}>
                        • {item.product_article?.display_name ?? '—'} &times; <strong>{item.quantity_ordered}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                {unassignedOrders.length} commande{unassignedOrders.length > 1 ? 's' : ''} · Imprimé le {new Date().toLocaleDateString('fr-FR')}
              </p>
            </div>
          );
        })()}
      </div>

      {/* ── UI principale ────────────────────────────────────────────────── */}
      <div className="no-print space-y-4 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-2">
          {/* Navigation date */}
          <button onClick={() => setDate(d => offsetDate(d, -1))} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center flex-1">
            <p className="font-bold text-gray-900 capitalize text-sm lg:text-base">{formatDateLabel(date)}</p>
            {totalOrders > 0 && (
              <p className="text-xs text-gray-400">{livrees}/{totalOrders} livrée{livrees > 1 ? 's' : ''}</p>
            )}
          </div>
          <button onClick={() => setDate(d => offsetDate(d, 1))} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight size={20} />
          </button>

          {date !== todayStr && (
            <button onClick={() => setDate(todayStr)} className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition-colors">
              Auj.
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Link href="/parametres/chauffeurs" className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
              <Settings size={18} />
            </Link>
            <button
              onClick={openPrintModal}
              disabled={orders.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
          </div>
        </div>

        {/* Filtre créneaux */}
        {(visibleSlots.length > 1 || hasNoSlot) && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            <button
              onClick={() => setSelectedSlot('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedSlot === '' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Tous
            </button>
            {visibleSlots.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSlot(s.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedSlot === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {slotLabel(s)}
              </button>
            ))}
            {hasNoSlot && (
              <button
                onClick={() => setSelectedSlot('none')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedSlot === 'none' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Sans créneau
              </button>
            )}
          </div>
        )}

        {/* Filtre chauffeurs */}
        {drivers.filter(d => orders.some(o => o.driver_id === d.id)).length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            <button
              onClick={() => setSelectedDriver('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedDriver === '' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Tous
            </button>
            {drivers.filter(d => orders.some(o => o.driver_id === d.id)).map((driver, dIdx) => {
              const color = DRIVER_COLORS[dIdx % DRIVER_COLORS.length];
              const isSelected = selectedDriver === driver.id;
              return (
                <button
                  key={driver.id}
                  onClick={() => setSelectedDriver(isSelected ? '' : driver.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border-2"
                  style={isSelected
                    ? { backgroundColor: color.bg, borderColor: color.ring, color: color.text }
                    : { backgroundColor: 'white', borderColor: '#e5e7eb', color: '#6b7280' }
                  }
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: isSelected ? color.text : '#d1d5db', fontSize: 9 }}>
                    {driverInitials(driver).charAt(0)}
                  </span>
                  {driverFullName(driver)}
                </button>
              );
            })}
            {orders.some(o => !o.driver_id) && (
              <button
                onClick={() => setSelectedDriver(selectedDriver === 'none' ? '' : 'none')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border-2 ${selectedDriver === 'none' ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              >
                Non assignés
              </button>
            )}
          </div>
        )}

        {/* Contenu */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : totalOrders === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <Package className="mx-auto text-gray-300 mb-4" size={40} />
            <p className="text-gray-500 font-medium">Aucune livraison {date === todayStr ? "aujourd'hui" : 'ce jour'}</p>
            <Link href="/commandes/nouvelle" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
              <Plus size={16} /> Créer une commande
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {slotGroups.map(({ key, slot, driverGroups }) => (
              <div key={key}>
                {/* En-tête créneau */}
                {(() => {
                  const slotId = slot?.id ?? null;
                  const slotRoutes = routes.filter(
                    r => (r.delivery_slot_id ?? null) === slotId
                  );
                  return (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {slot ? slotLabel(slot) : 'Sans créneau'}
                          </span>
                          {slotRoutes.length > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">
                              {slotRoutes.length} tournée{slotRoutes.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="h-px flex-1 bg-gray-200" />
                        <button
                          onClick={() => openCreateRoute(slot)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors shrink-0"
                        >
                          <Plus size={11} /> Tournée
                        </button>
                      </div>

                      {/* Tournées du créneau */}
                      {slotRoutes.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {slotRoutes.map(route => (
                            <RouteCard
                              key={route.id}
                              route={route}
                              orders={orders}
                              onCancelled={routeId => setRoutes(prev => prev.filter(r => r.id !== routeId))}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Groupes chauffeurs */}
                <div className="space-y-4">
                  {driverGroups.map(({ driver, driverIdx, orders: dOrders }) => {
                    const color = driver ? DRIVER_COLORS[driverIdx % DRIVER_COLORS.length] : null;

                    return (
                      <div key={driver?.id ?? 'unassigned'} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        {/* En-tête chauffeur */}
                        <div
                          className="flex items-center gap-3 px-4 py-3 border-b border-gray-50"
                          style={color ? { backgroundColor: color.bg } : { backgroundColor: '#F9FAFB' }}
                        >
                          {driver ? (
                            <>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color!.text, color: 'white' }}>
                                {driverInitials(driver)}
                              </div>
                              <div>
                                <p className="font-semibold text-sm" style={{ color: color!.text }}>{driverFullName(driver)}</p>
                                {driver.phone && <p className="text-xs opacity-70" style={{ color: color!.text }}>{driver.phone}</p>}
                              </div>
                              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'white', color: color!.text }}>
                                {dOrders.length} arrêt{dOrders.length > 1 ? 's' : ''}
                              </span>
                            </>
                          ) : (
                            <>
                              <UserCircle size={20} className="text-gray-400" />
                              <p className="font-semibold text-sm text-gray-500">Non assigné</p>
                              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                                {dOrders.length} commande{dOrders.length > 1 ? 's' : ''}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Commandes */}
                        <div className="divide-y divide-gray-50">
                          {dOrders.map((order, stopIdx) => {
                            const isDragging = draggedId === order.id;
                            const isDragOver = dragOverId === order.id;
                            const isDelivered = order.status === 'livree';

                            return (
                              <div
                                key={order.id}
                                draggable={!!driver}
                                onDragStart={() => driver && setDraggedId(order.id)}
                                onDragOver={e => { e.preventDefault(); driver && setDragOverId(order.id); }}
                                onDragLeave={() => setDragOverId(null)}
                                onDrop={() => driver && handleDrop(dOrders, order.id)}
                                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                                className={`flex gap-3 px-4 py-4 transition-all ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'bg-blue-50 border-l-4 border-blue-400' : ''} ${isDelivered ? 'bg-green-50/40' : ''}`}
                              >
                                {/* Drag handle + numéro */}
                                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0 w-7">
                                  {driver && <GripVertical size={15} className="text-gray-300 cursor-grab active:cursor-grabbing" />}
                                  <span className="text-xs font-bold text-gray-400">{driver ? stopIdx + 1 : '·'}</span>
                                </div>

                                {/* Infos commande */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className={`font-semibold text-gray-900 text-sm ${isDelivered ? 'line-through text-gray-400' : ''}`}>
                                        {order.client?.nom ?? '—'}
                                      </p>
                                      {(() => {
                                        const info = routedOrderMap.get(order.id);
                                        if (!info) return null;
                                        return (
                                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full mt-0.5">
                                            <Navigation size={9} />
                                            {info.routeNumber}{info.driverName ? ` · ${info.driverName}` : ''}
                                          </span>
                                        );
                                      })()}
                                      {order.client?.telephone && (
                                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                          <Phone size={10} /> {order.client.telephone}
                                        </p>
                                      )}
                                      {order.client?.adresse_livraison && (
                                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                          <MapPin size={10} /> {order.client.adresse_livraison}
                                        </p>
                                      )}
                                      {order.note && (
                                        <p className="text-xs text-amber-600 mt-1">⚠️ {order.note}</p>
                                      )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {assigningId === order.id ? (
                                        <div className="flex items-center gap-1 flex-wrap justify-end">
                                          {drivers.map((d, dIdx) => (
                                            <button
                                              key={d.id}
                                              onClick={() => assignDriver(order.id, d.id)}
                                              className="text-xs px-2 py-1 rounded-lg font-semibold transition-colors"
                                              style={{ backgroundColor: DRIVER_COLORS[dIdx % DRIVER_COLORS.length].bg, color: DRIVER_COLORS[dIdx % DRIVER_COLORS.length].text }}
                                            >
                                              {driverInitials(d)}
                                            </button>
                                          ))}
                                          {order.driver_id && (
                                            <button onClick={() => assignDriver(order.id, null)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">Ret.</button>
                                          )}
                                          <button onClick={() => setAssigningId(null)} className="text-xs text-gray-400 px-1">✕</button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setAssigningId(order.id)}
                                          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors font-medium"
                                        >
                                          {order.driver_id
                                            ? (() => { const d = drivers.find(d => d.id === order.driver_id); return d ? driverInitials(d) : 'Changer'; })()
                                            : '+ Ch.'
                                          }
                                        </button>
                                      )}

                                      {!isDelivered ? (
                                        <button
                                          onClick={() => openDeliveryModal(order)}
                                          className="p-2 rounded-xl text-gray-400 hover:text-green-600 hover:bg-green-50 active:scale-95 transition-all"
                                        >
                                          <CheckCircle size={20} />
                                        </button>
                                      ) : (
                                        <div className="p-2 text-green-500">
                                          <CheckCircle size={20} />
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Produits */}
                                  {order.items.length > 0 && (
                                    <ul className="mt-2 space-y-0.5">
                                      {order.items.map(item => (
                                        <li key={item.id} className="text-xs text-gray-600 flex items-baseline gap-1.5">
                                          <span className="text-gray-300">•</span>
                                          <span>{item.product_article?.display_name ?? '—'}</span>
                                          <span className="font-semibold text-gray-800">×{item.quantity_ordered}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <p className="text-xs text-gray-400 mt-1.5">{order.numero} · {formatPrice(order.total)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Livrées du jour */}
        {deliveredOrders.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistory(h => !h)}
              className="w-full flex items-center gap-3 py-3 group"
            >
              <div className="h-px flex-1 bg-gray-200 group-hover:bg-green-200 transition-colors" />
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-400 group-hover:text-green-600 transition-colors">
                <CheckCircle size={15} />
                Livrées ({deliveredOrders.length})
                <ChevronRight size={14} className={`transition-transform ${showHistory ? 'rotate-90' : ''}`} />
              </span>
              <div className="h-px flex-1 bg-gray-200 group-hover:bg-green-200 transition-colors" />
            </button>

            {showHistory && (
              <div className="bg-white rounded-2xl border border-green-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {deliveredOrders
                    .slice()
                    .sort((a, b) => (a.delivery_slot?.start_time ?? '99:99').localeCompare(b.delivery_slot?.start_time ?? '99:99'))
                    .map(order => {
                      const driver = drivers.find(d => d.id === order.driver_id);
                      const driverIdx = driver ? drivers.findIndex(d => d.id === driver.id) : -1;
                      const color = driver ? DRIVER_COLORS[driverIdx % DRIVER_COLORS.length] : null;
                      return (
                        <div key={order.id} className="flex items-center gap-3 px-4 py-3 opacity-70">
                          <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-600 line-through truncate">{order.client?.nom ?? '—'}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {order.items.map(i => `${i.product_article?.display_name ?? '—'} ×${i.quantity_delivered ?? i.quantity_ordered}`).join(' · ')}
                            </p>
                          </div>
                          {driver && color && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: color.bg, color: color.text }}>
                              {driverInitials(driver)}
                            </span>
                          )}
                          {!order.is_fully_delivered && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium flex-shrink-0">
                              Partielle
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal livraison ─────────────────────────────────────────────────── */}
      {deliveryOrder && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50 no-print" onClick={closeDeliveryModal} />
          <div className="fixed bottom-0 left-0 right-0 z-50 no-print bg-white rounded-t-2xl shadow-xl lg:relative lg:inset-auto lg:rounded-2xl lg:max-w-md lg:mx-auto"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Handle mobile */}
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">
                  {deliveryStep === 1 ? 'Confirmer la livraison' : 'Reliquat non livré'}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">{deliveryOrder.client?.nom ?? deliveryOrder.numero}</p>
              </div>
              <button onClick={closeDeliveryModal} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={20} />
              </button>
            </div>

            {deliveryStep === 1 ? (
              <>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantités livrées</p>
                  {deliveryOrder.items.map(item => {
                    const qty = deliveryQtys[item.id] ?? item.quantity_ordered;
                    const isShort = qty < item.quantity_ordered;
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <p className={`flex-1 text-sm ${isShort ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>
                          {item.product_article?.display_name ?? '—'}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">sur {item.quantity_ordered}</span>
                          <input
                            type="number"
                            min={0}
                            max={item.quantity_ordered}
                            value={qty}
                            onChange={e => setDeliveryQtys(prev => ({
                              ...prev,
                              [item.id]: Math.min(item.quantity_ordered, Math.max(0, parseInt(e.target.value) || 0))
                            }))}
                            className={`w-20 text-center border rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none transition-colors ${isShort ? 'border-amber-300 bg-amber-50 focus:border-amber-500' : 'border-gray-200 focus:border-blue-400'}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 py-4 border-t border-gray-100" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
                  <button
                    onClick={() => {
                      const isPartial = deliveryOrder.items.some(
                        item => (deliveryQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered
                      );
                      if (isPartial) goToBackorderStep();
                      else confirmFullDelivery();
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
                  >
                    Confirmer la livraison
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 space-y-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Articles non livrés</p>
                    {deliveryOrder.items
                      .filter(item => (deliveryQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered)
                      .map(item => (
                        <p key={item.id} className="text-sm text-amber-800">
                          {item.product_article?.display_name ?? '—'}
                          <span className="font-bold ml-1">×{item.quantity_ordered - (deliveryQtys[item.id] ?? item.quantity_ordered)}</span>
                        </p>
                      ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date de livraison</p>
                    <input
                      type="date"
                      value={backorderDate}
                      min={localDateStr()}
                      onChange={e => setBackorderDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-blue-400 transition-colors"
                    />
                  </div>
                  {slots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Créneau</p>
                      <div className="flex flex-wrap gap-2">
                        {slots.map(s => (
                          <button key={s.id} onClick={() => setBackorderSlotId(s.id)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${backorderSlotId === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {slotLabel(s)}
                          </button>
                        ))}
                        <button onClick={() => setBackorderSlotId(null)}
                          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${backorderSlotId === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          Sans créneau
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
                  <button
                    onClick={() => confirmPartialWithBackorder(false)}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Sans reliquat
                  </button>
                  <button
                    onClick={() => confirmPartialWithBackorder(true)}
                    disabled={!backorderDate}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    Créer le reliquat →
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Modal création tournée ──────────────────────────────────────────── */}
      {showCreateRoute && (
        <CreateRouteModal
          date={date}
          initialSlot={createRouteInitialSlot}
          slots={slots}
          drivers={drivers}
          allOrders={orders.filter(o => o.status !== 'livree' && o.status !== 'annulee')}
          existingRoutes={routes}
          onClose={() => setShowCreateRoute(false)}
          onCreated={route => {
            setRoutes(prev => [...prev, route]);
            setShowCreateRoute(false);
          }}
        />
      )}

      {/* ── Modal impression ────────────────────────────────────────────────── */}
      {showPrintModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50 no-print" onClick={() => setShowPrintModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 no-print bg-white rounded-t-2xl shadow-xl lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:w-full lg:max-w-4xl"
            style={{ maxHeight: '95vh' }}>

            {/* Handle mobile */}
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-bold text-gray-900">Feuilles de route</h2>
                <p className="text-sm text-gray-400 mt-0.5 capitalize">
                  {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col lg:flex-row" style={{ height: 'calc(95vh - 130px)', maxHeight: 'calc(95vh - 130px)' }}>

              {/* Panneau sélection */}
              <div className="lg:w-64 lg:flex-shrink-0 lg:border-r border-gray-100 overflow-y-auto px-4 py-4 space-y-5">
                {/* Chauffeurs */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Chauffeurs</p>
                  <div className="space-y-2">
                    {drivers.filter(d => orders.some(o => o.driver_id === d.id)).map((driver, dIdx) => {
                      const color = DRIVER_COLORS[dIdx % DRIVER_COLORS.length];
                      const stopCount = getPrintOrders(driver.id).length;
                      const checked = printDriverIds.has(driver.id);
                      return (
                        <button
                          key={driver.id}
                          onClick={() => togglePrintDriver(driver.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${checked ? 'border-transparent' : 'border-gray-100 bg-gray-50 opacity-50'}`}
                          style={checked ? { backgroundColor: color.bg, borderColor: color.ring } : {}}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: color.text }}>
                            {driverInitials(driver)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate" style={checked ? { color: color.text } : { color: '#6b7280' }}>{driverFullName(driver)}</p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={checked ? { backgroundColor: 'white', color: color.text } : { backgroundColor: '#e5e7eb', color: '#9ca3af' }}>
                            {stopCount}
                          </span>
                          <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={checked ? { backgroundColor: color.text, borderColor: color.text } : { borderColor: '#d1d5db' }}>
                            {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </button>
                      );
                    })}

                    {/* Option sans chauffeur */}
                    {hasUnassignedOrders && (() => {
                      const checked = printDriverIds.has('unassigned');
                      const count = getPrintOrders('unassigned').length;
                      return (
                        <button
                          onClick={() => togglePrintDriver('unassigned')}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${checked ? 'border-gray-300 bg-gray-100' : 'border-gray-100 bg-gray-50 opacity-50'}`}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-gray-400">
                            ?
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-600">Sans chauffeur</p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-gray-200 text-gray-500">
                            {count}
                          </span>
                          <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={checked ? { backgroundColor: '#6b7280', borderColor: '#6b7280' } : { borderColor: '#d1d5db' }}>
                            {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {/* Créneaux */}
                {visibleSlots.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Créneaux</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => togglePrintSlot('all')} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${printSlotIds.has('all') ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Tous</button>
                      {visibleSlots.map(s => (
                        <button key={s.id} onClick={() => togglePrintSlot(s.id)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${!printSlotIds.has('all') && printSlotIds.has(s.id) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {slotLabel(s)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Aperçu A4 — desktop uniquement */}
              <div className="hidden lg:flex flex-1 flex-col bg-gray-100 min-h-0">
                {(() => {
                  const printableDrivers = drivers.filter(d => printDriverIds.has(d.id) && getPrintOrders(d.id).length > 0);
                  const idx = Math.min(previewIndex, Math.max(0, printableDrivers.length - 1));
                  const driver = printableDrivers[idx];

                  if (!driver) {
                    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sélectionnez un chauffeur</div>;
                  }

                  const driverOrders = getPrintOrders(driver.id);
                  const availableH = window.innerHeight * 0.9 - 65 - 76 - (printableDrivers.length > 1 ? 52 : 0) - 16;
                  const availableW = Math.min(window.innerWidth - 32, 896) - 257 - 16;
                  const zoom = Math.max(0.4, Math.min(availableW / 794, availableH / 1123, 0.95));

                  return (
                    <>
                      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 8 }}>
                        <div style={{ zoom, width: 794, minHeight: 1123, flexShrink: 0, backgroundColor: 'white', boxShadow: '0 2px 20px rgba(0,0,0,0.15)', fontFamily: 'Arial, sans-serif', padding: '56px 64px 48px' }}>
                          <div style={{ borderBottom: '2px solid #111', paddingBottom: '14px', marginBottom: '24px' }}>
                            <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0 }}>Feuille de route — {driverFullName(driver)}</h1>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '6px 0 0' }}>
                              {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              {driver.phone ? `  ·  ${driver.phone}` : ''}
                            </p>
                          </div>
                          {driverOrders.map((order, stopIdx) => (
                            <div key={order.id} style={{ marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '5px' }}>
                                <span style={{ fontSize: '15px', fontWeight: 'bold', minWidth: '26px', color: '#111' }}>#{stopIdx + 1}</span>
                                <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#111' }}>{order.client?.nom ?? '—'}</span>
                                {order.delivery_slot && (
                                  <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                    {order.delivery_slot.name} {order.delivery_slot.start_time.slice(0, 5)}–{order.delivery_slot.end_time.slice(0, 5)}
                                  </span>
                                )}
                              </div>
                              {order.client?.telephone && <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 2px 36px' }}>📞 {order.client.telephone}</p>}
                              {order.client?.adresse_livraison && <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 6px 36px' }}>📍 {order.client.adresse_livraison}</p>}
                              {order.note && <p style={{ fontSize: '12px', color: '#d97706', margin: '2px 0 6px 36px' }}>⚠️ {order.note}</p>}
                              <ul style={{ margin: '6px 0 0 36px', padding: 0, listStyle: 'none' }}>
                                {order.items.map(item => (
                                  <li key={item.id} style={{ fontSize: '13px', color: '#111', padding: '2px 0' }}>
                                    • {item.product_article?.display_name ?? '—'} &times; <strong>{item.quantity_ordered}</strong>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                          <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '16px' }}>
                            {driverOrders.length} arrêt{driverOrders.length > 1 ? 's' : ''} · Imprimé le {new Date().toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>

                      {printableDrivers.length > 1 && (
                        <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-100 flex-shrink-0">
                          <button onClick={() => setPreviewIndex(Math.max(0, idx - 1))} disabled={idx === 0} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-colors">
                            <ChevronLeft size={18} />
                          </button>
                          <span className="text-sm font-medium text-gray-700">
                            {driverFullName(driver)}
                            <span className="text-gray-400 font-normal ml-2">{idx + 1} / {printableDrivers.length}</span>
                          </span>
                          <button onClick={() => setPreviewIndex(Math.min(printableDrivers.length - 1, idx + 1))} disabled={idx === printableDrivers.length - 1} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-colors">
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
              <button onClick={() => setShowPrintModal(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                Annuler
              </button>
              <button
                onClick={executePrint}
                disabled={printDriverIds.size === 0 || printStopCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                <Printer size={16} />
                Imprimer {printStopCount > 0 ? `(${printStopCount} arrêt${printStopCount > 1 ? 's' : ''})` : ''}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
