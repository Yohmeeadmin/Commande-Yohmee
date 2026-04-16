'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, Printer, Settings, GripVertical,
  CheckCircle, Phone, MapPin, Package, UserCircle, Plus,
  LayoutList, Table2, X, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Driver, driverFullName, driverInitials } from '@/types';
import { formatPrice } from '@/lib/utils';

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
  const d = new Date(base); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function formatDateLabel(s: string) {
  const today = new Date().toISOString().split('T')[0];
  if (s === today) return "Aujourd'hui";
  if (s === offsetDate(today, 1)) return 'Demain';
  if (s === offsetDate(today, -1)) return 'Hier';
  return new Date(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function slotLabel(s: Slot) {
  return `${s.name}  ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
}

// Couleurs fixes par position de chauffeur
const DRIVER_COLORS = [
  { bg: '#DBEAFE', text: '#1E40AF', ring: '#93C5FD' },
  { bg: '#D1FAE5', text: '#065F46', ring: '#6EE7B7' },
  { bg: '#EDE9FE', text: '#5B21B6', ring: '#C4B5FD' },
  { bg: '#FEF3C7', text: '#92400E', ring: '#FCD34D' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LivraisonsPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(todayStr);
  const [selectedSlot, setSelectedSlot] = useState('');    // '' = tous
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'tournees' | 'tableau'>('tournees');
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
  const [sortKey, setSortKey] = useState<string>('slot');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printDriverIds, setPrintDriverIds] = useState<Set<string>>(new Set());
  const [printSlotIds, setPrintSlotIds] = useState<Set<string>>(new Set(['all']));
  const [previewIndex, setPreviewIndex] = useState(0);

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    try {
      await supabase.rpc('generate_orders_from_recurring', { target_date: d });

      const [{ data: driversData }, { data: slotsData }, { data: ordersData }] = await Promise.all([
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
      ]);

      setDrivers(driversData || []);
      setSlots(slotsData || []);
      setOrders((ordersData as DeliveryOrder[]) || []);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => { loadData(date); }, [date, loadData]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function assignDriver(orderId: string, driverId: string | null) {
    // Séquence = fin de liste du chauffeur pour ce créneau
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
    setBackorderDate(offsetDate(new Date().toISOString().split('T')[0], 1));
    setBackorderSlotId(order.delivery_slot?.id ?? null);
    setDeliveryOrder(order);
  }

  function closeDeliveryModal() {
    setDeliveryOrder(null);
    setDeliveryStep(1);
  }

  // Livraison complète — ferme directement
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

  // Livraison partielle → passe à l'étape 2 (reliquat)
  function goToBackorderStep() {
    setDeliveryStep(2);
  }

  // Confirme la livraison partielle + crée le reliquat
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
        // Si créneau différent de l'original, on le met à jour
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

  // Séparer actives et livrées
  const activeOrders = filteredOrders.filter(o => o.status !== 'livree');
  const deliveredOrders = filteredOrders.filter(o => o.status === 'livree');

  // Créneaux présents dans les données + "sans créneau"
  const activeSlotIds = new Set(orders.map(o => o.delivery_slot?.id ?? 'none'));
  const visibleSlots = slots.filter(s => activeSlotIds.has(s.id));
  const hasNoSlot = activeSlotIds.has('none');

  // Groupes à afficher (créneau → chauffeurs → commandes) — uniquement actives
  const slotGroups: { key: string; slot: Slot | null; driverGroups: { driver: Driver | null; driverIdx: number; orders: DeliveryOrder[] }[] }[] = [];

  function buildSlotGroup(slot: Slot | null) {
    const slotId = slot?.id ?? null;
    const slotOrders = activeOrders.filter(o =>
      slotId === null ? !o.delivery_slot : o.delivery_slot?.id === slotId
    );
    if (slotOrders.length === 0) return null;

    const driverGroups: typeof slotGroups[0]['driverGroups'] = [];

    // Chauffeurs assignés (dans l'ordre de la liste drivers)
    drivers.forEach((driver, idx) => {
      const dOrders = slotOrders
        .filter(o => o.driver_id === driver.id)
        .sort((a, b) => (a.driver_sequence ?? 999) - (b.driver_sequence ?? 999));
      if (dOrders.length > 0) driverGroups.push({ driver, driverIdx: idx, orders: dOrders });
    });

    // Non assignés
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

  // Stats pour le header
  const totalOrders = filteredOrders.length;
  const livrees = deliveredOrders.length;

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  }

  // ── Print ────────────────────────────────────────────────────────────────────

  function openPrintModal() {
    const driverIdsWithOrders = new Set(orders.filter(o => o.driver_id).map(o => o.driver_id!));
    setPrintDriverIds(driverIdsWithOrders);
    setPrintSlotIds(new Set(['all']));
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

  // Commandes filtrées pour l'impression
  function getPrintOrders(driverId: string) {
    return orders
      .filter(o => o.driver_id === driverId)
      .filter(o => printSlotIds.has('all') || printSlotIds.has(o.delivery_slot?.id ?? 'none'))
      .sort((a, b) => {
        const slotA = a.delivery_slot?.start_time ?? '99:99';
        const slotB = b.delivery_slot?.start_time ?? '99:99';
        if (slotA !== slotB) return slotA.localeCompare(slotB);
        return (a.driver_sequence ?? 999) - (b.driver_sequence ?? 999);
      });
  }

  const printStopCount = [...printDriverIds].reduce((acc, dId) => acc + getPrintOrders(dId).length, 0);

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

      {/* ── Zone imprimable (cachée normalement) ─────────────────────────── */}
      <div className="print-area hidden">
        {drivers.filter(d => printDriverIds.has(d.id)).map((driver, dIdx) => {
          const driverOrders = getPrintOrders(driver.id);

          if (driverOrders.length === 0) return null;

          return (
            <div key={driver.id} className={dIdx > 0 ? 'print-page-break' : ''} style={{ fontFamily: 'Arial, sans-serif', padding: '24px', maxWidth: '700px' }}>
              {/* En-tête feuille */}
              <div style={{ borderBottom: '2px solid #111', paddingBottom: '12px', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                  Feuille de route — {driverFullName(driver)}
                </h1>
                <p style={{ fontSize: '13px', color: '#555', margin: '4px 0 0' }}>
                  {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {driver.phone ? `  ·  ${driver.phone}` : ''}
                </p>
              </div>

              {/* Arrêts */}
              {driverOrders.map((order, stopIdx) => (
                <div key={order.id} style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 'bold', minWidth: '24px' }}>#{stopIdx + 1}</span>
                    <span style={{ fontSize: '15px', fontWeight: 'bold' }}>{order.client?.nom ?? '—'}</span>
                    {order.delivery_slot && (
                      <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: 'auto' }}>
                        {order.delivery_slot.name}  {order.delivery_slot.start_time.slice(0, 5)}–{order.delivery_slot.end_time.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  {order.client?.telephone && (
                    <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 2px 34px' }}>📞 {order.client.telephone}</p>
                  )}
                  {order.client?.adresse_livraison && (
                    <p style={{ fontSize: '12px', color: '#555', margin: '2px 0 6px 34px' }}>📍 {order.client.adresse_livraison}</p>
                  )}
                  {order.note && (
                    <p style={{ fontSize: '12px', color: '#d97706', margin: '2px 0 6px 34px' }}>⚠️ {order.note}</p>
                  )}
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
                {driverOrders.length} arrêt{driverOrders.length > 1 ? 's' : ''}  ·  Imprimé le {new Date().toLocaleDateString('fr-FR')}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── UI principale ────────────────────────────────────────────────── */}
      <div className={`no-print space-y-5 ${viewMode === 'tournees' ? 'max-w-5xl mx-auto' : 'max-w-none'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Navigation date */}
          <div className="flex items-center gap-1">
            <button onClick={() => setDate(d => offsetDate(d, -1))} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <div className="text-center min-w-[150px]">
              <p className="font-bold text-gray-900 capitalize">{formatDateLabel(date)}</p>
            </div>
            <button onClick={() => setDate(d => offsetDate(d, 1))} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>

          {date !== todayStr && (
            <button onClick={() => setDate(todayStr)} className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition-colors">
              Aujourd&apos;hui
            </button>
          )}

          {/* Stats */}
          {totalOrders > 0 && (
            <span className="text-sm text-gray-500 font-medium">
              {livrees}/{totalOrders} livrée{livrees > 1 ? 's' : ''}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Toggle vue */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode('tournees')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'tournees' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <LayoutList size={15} /> Tournées
              </button>
              <button
                onClick={() => setViewMode('tableau')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'tableau' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Table2 size={15} /> Tableau
              </button>
            </div>

            <Link href="/parametres/chauffeurs" className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors" title="Gérer les chauffeurs">
              <Settings size={20} />
            </Link>
            <button
              onClick={openPrintModal}
              disabled={drivers.filter(d => orders.some(o => o.driver_id === d.id)).length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <Printer size={18} />
              Imprimer
            </button>
          </div>
        </div>

        {/* Filtre créneaux */}
        {(visibleSlots.length > 1 || hasNoSlot) && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSlot('')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selectedSlot === '' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Tous les créneaux
            </button>
            {visibleSlots.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSlot(s.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selectedSlot === s.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {slotLabel(s)}
              </button>
            ))}
            {hasNoSlot && (
              <button
                onClick={() => setSelectedSlot('none')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selectedSlot === 'none' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Sans créneau
              </button>
            )}
          </div>
        )}

        {/* Filtre chauffeurs */}
        {drivers.filter(d => orders.some(o => o.driver_id === d.id)).length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedDriver('')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selectedDriver === '' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Tous les chauffeurs
            </button>
            {drivers.filter(d => orders.some(o => o.driver_id === d.id)).map((driver, dIdx) => {
              const color = DRIVER_COLORS[dIdx % DRIVER_COLORS.length];
              const isSelected = selectedDriver === driver.id;
              return (
                <button
                  key={driver.id}
                  onClick={() => setSelectedDriver(isSelected ? '' : driver.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all border-2"
                  style={isSelected
                    ? { backgroundColor: color.bg, borderColor: color.ring, color: color.text }
                    : { backgroundColor: 'white', borderColor: '#e5e7eb', color: '#6b7280' }
                  }
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: isSelected ? color.text : '#d1d5db' }}>
                    {driverInitials(driver).charAt(0)}
                  </span>
                  {driverFullName(driver)}
                </button>
              );
            })}
            {orders.some(o => !o.driver_id) && (
              <button
                onClick={() => setSelectedDriver(selectedDriver === 'none' ? '' : 'none')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border-2 ${selectedDriver === 'none' ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
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
        ) : viewMode === 'tableau' ? (
          /* ── Vue Tableau ───────────────────────────────────────────────── */
          <div className="-mx-4 lg:-mx-8 -mb-4 lg:-mb-8">
            <div className="overflow-x-auto bg-white border-t border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="px-6 py-3 font-medium text-gray-500 w-8">#</th>
                    <th onClick={() => handleSort('client')} className="px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                      <span className="flex items-center gap-1">Client <SortIcon col="client" /></span>
                    </th>
                    <th onClick={() => handleSort('slot')} className="px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                      <span className="flex items-center gap-1">Créneau <SortIcon col="slot" /></span>
                    </th>
                    <th onClick={() => handleSort('driver')} className="px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                      <span className="flex items-center gap-1">Chauffeur <SortIcon col="driver" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-500">Produits</th>
                    <th onClick={() => handleSort('total')} className="px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700 text-right">
                      <span className="flex items-center justify-end gap-1">Total <SortIcon col="total" /></span>
                    </th>
                    <th onClick={() => handleSort('statut')} className="px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                      <span className="flex items-center gap-1">Statut <SortIcon col="statut" /></span>
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredOrders
                    .slice()
                    .sort((a, b) => {
                      let valA: string | number = '';
                      let valB: string | number = '';
                      switch (sortKey) {
                        case 'client': valA = a.client?.nom?.toLowerCase() || ''; valB = b.client?.nom?.toLowerCase() || ''; break;
                        case 'slot':   valA = a.delivery_slot?.start_time ?? '99:99'; valB = b.delivery_slot?.start_time ?? '99:99'; break;
                        case 'driver': { const dA = drivers.findIndex(d => d.id === a.driver_id); const dB = drivers.findIndex(d => d.id === b.driver_id); valA = dA === -1 ? 999 : dA; valB = dB === -1 ? 999 : dB; break; }
                        case 'total':  valA = a.total; valB = b.total; break;
                        case 'statut': valA = a.status; valB = b.status; break;
                        default:       valA = a.delivery_slot?.start_time ?? '99:99'; valB = b.delivery_slot?.start_time ?? '99:99';
                      }
                      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                      return 0;
                    })
                    .map(order => {
                      const driver = drivers.find(d => d.id === order.driver_id);
                      const driverIdx = driver ? drivers.findIndex(d => d.id === driver.id) : -1;
                      const color = driver ? DRIVER_COLORS[driverIdx % DRIVER_COLORS.length] : null;
                      const isDelivered = order.status === 'livree';

                      return (
                        <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${isDelivered ? 'opacity-60' : ''}`}>
                          {/* Séquence */}
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                            {order.driver_sequence ?? '—'}
                          </td>

                          {/* Client */}
                          <td className="px-4 py-3">
                            <p className={`font-semibold text-gray-900 ${isDelivered ? 'line-through' : ''}`}>
                              {order.client?.nom ?? '—'}
                            </p>
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
                          </td>

                          {/* Créneau */}
                          <td className="px-4 py-3 text-gray-600 text-sm whitespace-nowrap">
                            {order.delivery_slot ? slotLabel(order.delivery_slot) : <span className="text-gray-300">—</span>}
                          </td>

                          {/* Chauffeur */}
                          <td className="px-4 py-3">
                            {assigningId === order.id ? (
                              <div className="flex items-center gap-1 flex-wrap">
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
                                  <button onClick={() => assignDriver(order.id, null)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">✕</button>
                                )}
                                <button onClick={() => setAssigningId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">Annuler</button>
                              </div>
                            ) : driver ? (
                              <button
                                onClick={() => setAssigningId(order.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors hover:opacity-80"
                                style={{ backgroundColor: color!.bg, color: color!.text }}
                              >
                                <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color!.text }}>
                                  {driverInitials(driver).charAt(0)}
                                </span>
                                {driverFullName(driver)}
                              </button>
                            ) : (
                              <button
                                onClick={() => setAssigningId(order.id)}
                                className="text-xs px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
                              >
                                + Assigner
                              </button>
                            )}
                          </td>

                          {/* Produits */}
                          <td className="px-4 py-3">
                            <ul className="space-y-0.5">
                              {order.items.map(item => (
                                <li key={item.id} className="text-xs text-gray-600">
                                  {item.product_article?.display_name ?? '—'} <span className="font-semibold text-gray-800">×{item.quantity_ordered}</span>
                                </li>
                              ))}
                            </ul>
                          </td>

                          {/* Total */}
                          <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                            {formatPrice(order.total)}
                          </td>

                          {/* Statut */}
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isDelivered ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                              {isDelivered ? 'Livrée' : 'En cours'}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="px-4 py-3 text-right">
                            {!isDelivered ? (
                              <button
                                onClick={() => openDeliveryModal(order)}
                                className="p-2 rounded-xl text-gray-400 hover:text-green-600 hover:bg-green-50 active:scale-95 transition-all"
                                title="Marquer livrée"
                              >
                                <CheckCircle size={18} />
                              </button>
                            ) : (
                              <div className="p-2 text-green-500 flex justify-end">
                                <CheckCircle size={18} />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {slotGroups.map(({ key, slot, driverGroups }) => (
              <div key={key}>
                {/* En-tête créneau */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {slot ? slotLabel(slot) : 'Sans créneau'}
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Groupes chauffeurs */}
                <div className="space-y-4">
                  {driverGroups.map(({ driver, driverIdx, orders: dOrders }) => {
                    const color = driver ? DRIVER_COLORS[driverIdx % DRIVER_COLORS.length] : null;
                    const slotId = slot?.id ?? null;

                    return (
                      <div key={driver?.id ?? 'unassigned'} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        {/* En-tête chauffeur */}
                        <div
                          className="flex items-center gap-3 px-5 py-3 border-b border-gray-50"
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
                                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0 w-8">
                                  {driver && (
                                    <GripVertical size={16} className="text-gray-300 cursor-grab active:cursor-grabbing" />
                                  )}
                                  <span className="text-xs font-bold text-gray-400">
                                    {driver ? stopIdx + 1 : '·'}
                                  </span>
                                </div>

                                {/* Infos commande */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className={`font-semibold text-gray-900 ${isDelivered ? 'line-through text-gray-400' : ''}`}>
                                        {order.client?.nom ?? '—'}
                                      </p>
                                      {order.client?.telephone && (
                                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                          <Phone size={11} /> {order.client.telephone}
                                        </p>
                                      )}
                                      {order.client?.adresse_livraison && (
                                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                          <MapPin size={11} /> {order.client.adresse_livraison}
                                        </p>
                                      )}
                                      {order.note && (
                                        <p className="text-xs text-amber-600 mt-1">⚠️ {order.note}</p>
                                      )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                      {/* Assigner chauffeur */}
                                      {assigningId === order.id ? (
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {drivers.map((d, dIdx) => (
                                            <button
                                              key={d.id}
                                              onClick={() => assignDriver(order.id, d.id)}
                                              className="text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors"
                                              style={{
                                                backgroundColor: DRIVER_COLORS[dIdx % DRIVER_COLORS.length].bg,
                                                color: DRIVER_COLORS[dIdx % DRIVER_COLORS.length].text,
                                              }}
                                            >
                                              {driverInitials(d)}
                                            </button>
                                          ))}
                                          {order.driver_id && (
                                            <button
                                              onClick={() => assignDriver(order.id, null)}
                                              className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-500 font-medium transition-colors hover:bg-gray-200"
                                            >
                                              Retirer
                                            </button>
                                          )}
                                          <button
                                            onClick={() => setAssigningId(null)}
                                            className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-600"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setAssigningId(order.id)}
                                          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors font-medium"
                                        >
                                          {order.driver_id ? (
                                            (() => {
                                              const d = drivers.find(d => d.id === order.driver_id);
                                              return d ? driverInitials(d) : 'Changer';
                                            })()
                                          ) : '+ Chauffeur'}
                                        </button>
                                      )}

                                      {/* Marquer livré */}
                                      {!isDelivered ? (
                                        <button
                                          onClick={() => openDeliveryModal(order)}
                                          className="p-2 rounded-xl text-gray-400 hover:text-green-600 hover:bg-green-50 active:scale-95 transition-all"
                                          title="Marquer comme livrée"
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
                                        <li key={item.id} className="text-xs text-gray-600 flex items-baseline gap-2">
                                          <span className="text-gray-300">•</span>
                                          <span>{item.product_article?.display_name ?? '—'}</span>
                                          <span className="font-semibold text-gray-800">×{item.quantity_ordered}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}

                                  {/* Total */}
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

        {/* ── Historique du jour ───────────────────────────────────────── */}
        {deliveredOrders.length > 0 && (
          <div className={viewMode === 'tournees' ? 'max-w-5xl mx-auto' : ''}>
            <button
              onClick={() => setShowHistory(h => !h)}
              className="w-full flex items-center gap-3 py-3 group"
            >
              <div className="h-px flex-1 bg-gray-200 group-hover:bg-green-200 transition-colors" />
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-400 group-hover:text-green-600 transition-colors">
                <CheckCircle size={15} />
                Livrées aujourd&apos;hui ({deliveredOrders.length})
                <ChevronRight size={14} className={`transition-transform ${showHistory ? 'rotate-90' : ''}`} />
              </span>
              <div className="h-px flex-1 bg-gray-200 group-hover:bg-green-200 transition-colors" />
            </button>

            {showHistory && (
              <div className="bg-white rounded-2xl border border-green-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {deliveredOrders
                    .slice()
                    .sort((a, b) => {
                      const slotA = a.delivery_slot?.start_time ?? '99:99';
                      const slotB = b.delivery_slot?.start_time ?? '99:99';
                      return slotA.localeCompare(slotB);
                    })
                    .map(order => {
                      const driver = drivers.find(d => d.id === order.driver_id);
                      const driverIdx = driver ? drivers.findIndex(d => d.id === driver.id) : -1;
                      const color = driver ? DRIVER_COLORS[driverIdx % DRIVER_COLORS.length] : null;
                      return (
                        <div key={order.id} className="flex items-center gap-3 px-4 py-3 opacity-70">
                          <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-600 line-through truncate">
                              {order.client?.nom ?? '—'}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {order.items.map(i => `${i.product_article?.display_name ?? '—'} ×${i.quantity_delivered ?? i.quantity_ordered}`).join(' · ')}
                            </p>
                          </div>
                          {order.delivery_slot && (
                            <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
                              {order.delivery_slot.name}
                            </span>
                          )}
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

      {/* ── Modal livraison ─────────────────────────────────────────────── */}
      {deliveryOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
          <div className="absolute inset-0 bg-black/40" onClick={closeDeliveryModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
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
                {/* Étape 1 — Quantités */}
                <div className="px-6 py-4 space-y-3">
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
                <div className="px-6 py-4 border-t border-gray-100">
                  <button
                    onClick={() => {
                      const isPartial = deliveryOrder.items.some(
                        item => (deliveryQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered
                      );
                      if (isPartial) goToBackorderStep();
                      else confirmFullDelivery();
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
                  >
                    Confirmer
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Étape 2 — Reliquat */}
                <div className="px-6 py-4 space-y-5">
                  {/* Résumé reliquat */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Articles non livrés</p>
                    {deliveryOrder.items
                      .filter(item => (deliveryQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered)
                      .map(item => (
                        <p key={item.id} className="text-sm text-amber-800">
                          {item.product_article?.display_name ?? '—'}
                          <span className="font-bold ml-1">
                            ×{item.quantity_ordered - (deliveryQtys[item.id] ?? item.quantity_ordered)}
                          </span>
                        </p>
                      ))}
                  </div>

                  {/* Date */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date de livraison</p>
                    <input
                      type="date"
                      value={backorderDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setBackorderDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-blue-400 transition-colors"
                    />
                  </div>

                  {/* Créneau */}
                  {slots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Créneau</p>
                      <div className="flex flex-wrap gap-2">
                        {slots.map(s => (
                          <button
                            key={s.id}
                            onClick={() => setBackorderSlotId(s.id)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${backorderSlotId === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            {slotLabel(s)}
                          </button>
                        ))}
                        <button
                          onClick={() => setBackorderSlotId(null)}
                          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${backorderSlotId === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          Sans créneau
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100">
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
        </div>
      )}

      {/* ── Modal impression ────────────────────────────────────────────── */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPrintModal(false)} />

          {/* Dialog — 2 colonnes */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl flex flex-col" style={{ height: '90vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Imprimer les feuilles de route</h2>
                <p className="text-sm text-gray-400 mt-0.5 capitalize">
                  {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Body — flex row */}
            <div className="flex flex-1 min-h-0">

              {/* Panneau gauche — sélection */}
              <div className="w-64 flex-shrink-0 border-r border-gray-100 overflow-y-auto px-4 py-5 space-y-5">

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
                            {driver.phone && <p className="text-xs opacity-70 truncate" style={checked ? { color: color.text } : { color: '#9ca3af' }}>{driver.phone}</p>}
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
                  </div>
                </div>

                {/* Créneaux */}
                {visibleSlots.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Créneaux</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => togglePrintSlot('all')} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${printSlotIds.has('all') ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        Tous
                      </button>
                      {visibleSlots.map(s => (
                        <button key={s.id} onClick={() => togglePrintSlot(s.id)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${!printSlotIds.has('all') && printSlotIds.has(s.id) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {slotLabel(s)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Panneau droit — aperçu A4 */}
              <div className="flex-1 min-h-0 flex flex-col bg-gray-100">
                {(() => {
                  const printableDrivers = drivers.filter(d => printDriverIds.has(d.id) && getPrintOrders(d.id).length > 0);
                  const idx = Math.min(previewIndex, Math.max(0, printableDrivers.length - 1));
                  const driver = printableDrivers[idx];

                  if (!driver) {
                    return (
                      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                        Sélectionnez un chauffeur
                      </div>
                    );
                  }

                  const driverOrders = getPrintOrders(driver.id);

                  // max-w-4xl = 896px, panneau gauche w-64 = 256px + border 1px = 257px
                  // Panneau droit = 896 - 257 = 639px. Padding 8px → A4 dispo = 623px
                  // Zoom par hauteur : 90vh - header(65) - footer(76) - nav(52) - padding(16) = hauteur dispo
                  const availableH = window.innerHeight * 0.9 - 65 - 76 - (printableDrivers.length > 1 ? 52 : 0) - 16;
                  const availableW = Math.min(window.innerWidth - 32, 896) - 257 - 16;
                  const zoom = Math.max(0.4, Math.min(availableW / 794, availableH / 1123, 0.95));

                  return (
                    <>
                      {/* Feuille A4 */}
                      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 8 }}>
                        <div style={{ zoom, width: 794, minHeight: 1123, flexShrink: 0, backgroundColor: 'white', boxShadow: '0 2px 20px rgba(0,0,0,0.15)', fontFamily: 'Arial, sans-serif', padding: '56px 64px 48px' }}>
                          {/* En-tête */}
                          <div style={{ borderBottom: '2px solid #111', paddingBottom: '14px', marginBottom: '24px' }}>
                            <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0 }}>
                              Feuille de route — {driverFullName(driver)}
                            </h1>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '6px 0 0' }}>
                              {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              {driver.phone ? `  ·  ${driver.phone}` : ''}
                            </p>
                          </div>

                          {/* Arrêts */}
                          {driverOrders.map((order, stopIdx) => (
                            <div key={order.id} style={{ marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '5px' }}>
                                <span style={{ fontSize: '15px', fontWeight: 'bold', minWidth: '26px', color: '#111' }}>#{stopIdx + 1}</span>
                                <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#111' }}>{order.client?.nom ?? '—'}</span>
                                {order.delivery_slot && (
                                  <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                    {order.delivery_slot.name}  {order.delivery_slot.start_time.slice(0, 5)}–{order.delivery_slot.end_time.slice(0, 5)}
                                  </span>
                                )}
                              </div>
                              {order.client?.telephone && (
                                <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 2px 36px' }}>📞 {order.client.telephone}</p>
                              )}
                              {order.client?.adresse_livraison && (
                                <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 6px 36px' }}>📍 {order.client.adresse_livraison}</p>
                              )}
                              {order.note && (
                                <p style={{ fontSize: '12px', color: '#d97706', margin: '2px 0 6px 36px' }}>⚠️ {order.note}</p>
                              )}
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
                            {driverOrders.length} arrêt{driverOrders.length > 1 ? 's' : ''}  ·  Imprimé le {new Date().toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>

                      {/* Navigation entre chauffeurs */}
                      {printableDrivers.length > 1 && (
                        <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-100 flex-shrink-0">
                          <button
                            onClick={() => setPreviewIndex(Math.max(0, idx - 1))}
                            disabled={idx === 0}
                            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <span className="text-sm font-medium text-gray-700">
                            {driverFullName(driver)}
                            <span className="text-gray-400 font-normal ml-2">{idx + 1} / {printableDrivers.length}</span>
                          </span>
                          <button
                            onClick={() => setPreviewIndex(Math.min(printableDrivers.length - 1, idx + 1))}
                            disabled={idx === printableDrivers.length - 1}
                            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-colors"
                          >
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
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
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
        </div>
      )}
    </>
  );
}
