'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, ShoppingCart, Calendar, CheckCircle, Play, Truck, RefreshCw, Pencil, X, Bell, Trash2, Square, CheckSquare, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { ORDER_STATUSES, OrderStatus } from '@/types';
import { formatDate, formatPrice } from '@/lib/utils';

interface DeliverySlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface EditItem {
  id: string;
  display_name: string;
  quantity_ordered: number;
  unit_price: number;
}

interface OrderWithClient {
  id: string;
  numero: string;
  delivery_date: string;
  delivery_slot_id: string | null;
  status: OrderStatus;
  total: number;
  reminder_days: number | null;
  client: { nom: string };
  delivery_slot: { name: string; start_time: string; end_time: string } | null;
}

function getDateLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  if (diff > 1 && diff <= 6)
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: Math.abs(diff) > 300 ? 'numeric' : undefined });
}

function isUrgent(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= 1;
}

export default function CommandesPage() {
  const [orders, setOrders] = useState<OrderWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [editOrder, setEditOrder] = useState<OrderWithClient | null>(null);
  const [editSlotId, setEditSlotId] = useState<string>('');
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  // Sélection (desktop)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders() {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, client:clients(nom), delivery_slot:delivery_slots(name, start_time, end_time)')
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      setOrders((data as OrderWithClient[]) || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function updateStatus(orderId: string, newStatus: OrderStatus) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  }

  async function markDelivered(orderId: string) {
    await supabase.from('orders').update({ status: 'livree', delivered_at: new Date().toISOString() }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'livree' } : o));
  }

  async function openEditModal(order: OrderWithClient) {
    setEditOrder(order);
    setEditSlotId(order.delivery_slot_id || '');
    setEditItems([]);
    setEditLoading(true);
    const [{ data: itemsData }, slotsResult] = await Promise.all([
      supabase.from('order_items').select('id, quantity_ordered, unit_price, product_article:product_articles(display_name)').eq('order_id', order.id).order('created_at'),
      slots.length === 0 ? supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order') : Promise.resolve({ data: null }),
    ]);
    if (slotsResult.data) setSlots(slotsResult.data);
    setEditItems((itemsData || []).map((item: any) => ({
      id: item.id,
      display_name: item.product_article?.display_name || '',
      quantity_ordered: item.quantity_ordered,
      unit_price: item.unit_price,
    })));
    setEditLoading(false);
  }

  async function saveEdit() {
    if (!editOrder) return;
    setEditLoading(true);
    const newTotal = editItems.reduce((sum, i) => sum + i.quantity_ordered * i.unit_price, 0);
    await Promise.all([
      supabase.from('orders').update({ delivery_slot_id: editSlotId || null, total: newTotal }).eq('id', editOrder.id),
      ...editItems.map(item => supabase.from('order_items').update({ quantity_ordered: item.quantity_ordered }).eq('id', item.id)),
    ]);
    setEditOrder(null);
    loadOrders();
    setEditLoading(false);
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    await supabase.from('order_items').delete().in('order_id', ids);
    await supabase.from('orders').delete().in('id', ids);
    setOrders(prev => prev.filter(o => !selectedIds.has(o.id)));
    setSelectedIds(new Set());
    setSelectionMode(false);
    setDeleteConfirm(false);
  }

  const getStatusStyle = (status: string) => {
    const s = ORDER_STATUSES.find(st => st.value === status);
    return s ? { color: s.color, bg: s.bgColor, label: s.label } : { color: '#6B7280', bg: '#F3F4F6', label: status };
  };

  const filteredOrders = useMemo(() => orders.filter(o => {
    const matchSearch = !search ||
      o.numero?.toLowerCase().includes(search.toLowerCase()) ||
      o.client?.nom?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = selectedStatus === 'all' || o.status === selectedStatus;
    const matchDate = !selectedDate || o.delivery_date === selectedDate;
    return matchSearch && matchStatus && matchDate;
  }), [orders, search, selectedStatus, selectedDate]);

  // Grouper par date de livraison
  const groupedOrders = useMemo(() => {
    const groups = new Map<string, { label: string; date: string; orders: OrderWithClient[] }>();
    filteredOrders.forEach(order => {
      const label = getDateLabel(order.delivery_date);
      if (!groups.has(order.delivery_date)) {
        groups.set(order.delivery_date, { label, date: order.delivery_date, orders: [] });
      }
      groups.get(order.delivery_date)!.orders.push(order);
    });
    return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredOrders]);

  // Stats rapides
  const statsToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return orders.filter(o => o.delivery_date === today && o.status !== 'annulee').length;
  }, [orders]);

  const statsPending = useMemo(() =>
    orders.filter(o => o.status === 'brouillon' || o.status === 'confirmee').length,
    [orders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Commandes</h1>
          <p className="text-sm text-gray-400">{filteredOrders.length} résultat{filteredOrders.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/recurrences" className="hidden lg:inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
            <RefreshCw size={15} /> Récurrentes
          </Link>
          <button
            onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); setDeleteConfirm(false); }}
            className={`hidden lg:inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${selectionMode ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'}`}
          >
            <CheckSquare size={15} /> {selectionMode ? 'Annuler' : 'Sélection'}
          </button>
          <Link href="/commandes/nouvelle" className="hidden lg:inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Nouvelle commande
          </Link>
        </div>
      </div>

      {/* Tuiles stats rapides */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calendar size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 leading-none">{statsToday}</p>
            <p className="text-xs text-gray-400 mt-0.5">livraisons aujourd&apos;hui</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShoppingCart size={18} className="text-orange-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-gray-900 leading-none">{statsPending}</p>
            <p className="text-xs text-gray-400 mt-0.5">en attente</p>
          </div>
        </div>
      </div>

      {/* Barre recherche + filtre */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Client ou numéro…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
            selectedStatus !== 'all' || selectedDate
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          <Filter size={15} />
          <span className="hidden sm:inline">Filtres</span>
          {(selectedStatus !== 'all' || selectedDate) && (
            <span className="w-2 h-2 rounded-full bg-white/80 sm:hidden" />
          )}
        </button>
      </div>

      {/* Panneau filtres dépliable */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
          {/* Chips statuts */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Statut</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedStatus('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  selectedStatus === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                Tous
              </button>
              {ORDER_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSelectedStatus(s.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                  style={selectedStatus === s.value
                    ? { backgroundColor: s.color, color: 'white', borderColor: s.color }
                    : { backgroundColor: s.bgColor, color: s.color, borderColor: s.bgColor }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {/* Date */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Date de livraison</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {selectedDate && (
                <button onClick={() => setSelectedDate('')} className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl bg-white">
                  Effacer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chips statuts — scroll rapide (toujours visible) */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        <button
          onClick={() => setSelectedStatus('all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
            selectedStatus === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
          }`}
        >
          Toutes
        </button>
        {ORDER_STATUSES.map((s) => {
          const count = orders.filter(o => o.status === s.value).length;
          if (count === 0) return null;
          return (
            <button
              key={s.value}
              onClick={() => setSelectedStatus(selectedStatus === s.value ? 'all' : s.value)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
              style={selectedStatus === s.value
                ? { backgroundColor: s.color, color: 'white', borderColor: s.color }
                : { backgroundColor: s.bgColor, color: s.color, borderColor: s.bgColor }}
            >
              {s.label}
              <span className="text-xs opacity-70 font-bold">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Barre sélection (desktop) */}
      {selectionMode && (
        <div className="hidden lg:flex bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (selectedIds.size === filteredOrders.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(filteredOrders.map(o => o.id)));
              }}
              className="flex items-center gap-2 text-sm font-medium text-orange-700"
            >
              {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
              {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            {selectedIds.size > 0 && <span className="text-sm text-orange-600">{selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>}
          </div>
          {selectedIds.size > 0 && (
            !deleteConfirm ? (
              <button onClick={() => setDeleteConfirm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium">
                <Trash2 size={16} /> Supprimer ({selectedIds.size})
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-700 font-medium">Confirmer ?</span>
                <button onClick={deleteSelected} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium">Oui</button>
                <button onClick={() => setDeleteConfirm(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">Non</button>
              </div>
            )
          )}
        </div>
      )}

      {/* Liste groupée par date */}
      {groupedOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <ShoppingCart className="text-gray-300 mx-auto mb-3" size={40} />
          <p className="text-gray-500 font-medium">Aucune commande</p>
          <Link href="/commandes/nouvelle" className="inline-flex items-center gap-2 mt-4 text-blue-600 text-sm font-medium">
            <Plus size={16} /> Créer une commande
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedOrders.map(({ label, date, orders: groupOrders }) => {
            const urgent = isUrgent(date);
            return (
              <div key={date}>
                {/* Label de date */}
                <div className="flex items-center gap-3 mb-2 px-1">
                  <span className={`text-sm font-bold ${urgent ? 'text-blue-600' : 'text-gray-500'}`}>
                    {label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${urgent ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    {groupOrders.length}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* Cartes */}
                <div className="space-y-2">
                  {groupOrders.map((order) => {
                    const style = getStatusStyle(order.status);
                    const canConfirm = order.status === 'brouillon';
                    const canProduce = order.status === 'confirmee';
                    const canDeliver = order.status === 'confirmee' || order.status === 'production';
                    return (
                      <div
                        key={order.id}
                        className={`bg-white rounded-2xl border overflow-hidden transition-colors ${
                          selectionMode && selectedIds.has(order.id) ? 'border-orange-300 bg-orange-50' : 'border-gray-100'
                        }`}
                      >
                        {/* Ligne principale — cliquable */}
                        <Link href={`/commandes/${order.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                          {/* Barre colorée statut */}
                          <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: style.color }} />

                          {/* Sélection desktop */}
                          {selectionMode && (
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); setSelectedIds(prev => { const n = new Set(prev); n.has(order.id) ? n.delete(order.id) : n.add(order.id); return n; }); }}
                              className="text-orange-500 flex-shrink-0"
                            >
                              {selectedIds.has(order.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                            </button>
                          )}

                          {/* Infos */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-gray-900 truncate">{order.client?.nom}</span>
                              <span className="font-bold text-gray-900 flex-shrink-0">{formatPrice(order.total)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
                                {order.delivery_slot
                                  ? <span className="truncate">{order.delivery_slot.name}</span>
                                  : <span>Sans créneau</span>
                                }
                                <span className="text-gray-200">·</span>
                                <span className="font-mono text-gray-300">{order.numero}</span>
                              </div>
                              <span
                                className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold"
                                style={{ backgroundColor: style.bg, color: style.color }}
                              >
                                {style.label}
                              </span>
                            </div>
                          </div>
                        </Link>

                        {/* Actions rapides — barre du bas */}
                        {(canConfirm || canProduce || canDeliver) && (
                          <div className="flex border-t border-gray-50 divide-x divide-gray-50">
                            {canConfirm && (
                              <button
                                onClick={() => updateStatus(order.id, 'confirmee')}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-emerald-600 active:bg-emerald-50"
                              >
                                <CheckCircle size={14} /> Confirmer
                              </button>
                            )}
                            {canProduce && (
                              <button
                                onClick={() => updateStatus(order.id, 'production')}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-amber-600 active:bg-amber-50"
                              >
                                <Play size={14} /> En production
                              </button>
                            )}
                            {canDeliver && (
                              <button
                                onClick={() => markDelivered(order.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-blue-600 active:bg-blue-50"
                              >
                                <Truck size={14} /> Livrer
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(order)}
                              className="flex items-center justify-center px-4 py-2.5 text-gray-400 active:bg-gray-50"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        )}
                        {(order.status === 'livree' || order.status === 'annulee') && (
                          <div className="border-t border-gray-50">
                            <Link
                              href={`/commandes/${order.id}`}
                              className="flex items-center justify-center py-2.5 text-xs text-gray-400 font-medium"
                            >
                              Voir les détails →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB mobile */}
      <Link
        href="/commandes/nouvelle"
        className="lg:hidden fixed bottom-24 right-4 z-30 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center active:bg-blue-700"
        style={{ boxShadow: '0 4px 20px rgba(37,99,235,0.4)' }}
      >
        <Plus size={26} />
      </Link>

      {/* Modal modifier commande */}
      {editOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditOrder(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg flex flex-col max-h-[92vh]">
            {/* Handle mobile */}
            <div className="sm:hidden w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Modifier la commande</h2>
                <p className="text-sm text-gray-400 mt-0.5">{editOrder.numero} — {editOrder.client?.nom}</p>
              </div>
              <button onClick={() => setEditOrder(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                <X size={20} />
              </button>
            </div>

            {editLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Créneau */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Créneau de livraison</label>
                  <select
                    value={editSlotId}
                    onChange={e => setEditSlotId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  >
                    <option value="">— Sans créneau —</option>
                    {slots.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)})</option>
                    ))}
                  </select>
                </div>
                {/* Articles */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Quantités</label>
                  <div className="space-y-2">
                    {editItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                        <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">{item.display_name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity_ordered: Math.max(0, i.quantity_ordered - 1) } : i))}
                            className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 font-bold text-lg"
                          >−</button>
                          <span className="w-10 text-center text-sm font-bold text-gray-900">{item.quantity_ordered}</span>
                          <button
                            onClick={() => setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity_ordered: i.quantity_ordered + 1 } : i))}
                            className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 font-bold text-lg"
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between py-3 border-t border-gray-100">
                  <span className="text-sm font-medium text-gray-500">Total</span>
                  <span className="text-xl font-black text-gray-900">
                    {formatPrice(editItems.reduce((sum, i) => sum + i.quantity_ordered * i.unit_price, 0))}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setEditOrder(null)} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-700 font-semibold text-sm">
                Annuler
              </button>
              <button onClick={saveEdit} disabled={editLoading} className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm disabled:opacity-50">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
