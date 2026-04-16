'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ShoppingCart, Calendar, CheckCircle, Play, Truck, MoreHorizontal, RefreshCw, Pencil, X, Bell, Trash2, Square, CheckSquare, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
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
  client: {
    nom: string;
  };
  delivery_slot: {
    name: string;
    start_time: string;
    end_time: string;
  } | null;
}

export default function CommandesPage() {
  const [orders, setOrders] = useState<OrderWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [editOrder, setEditOrder] = useState<OrderWithClient | null>(null);
  const [editSlotId, setEditSlotId] = useState<string>('');
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, client:clients(nom), delivery_slot:delivery_slots(name, start_time, end_time)')
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      setOrders((data as OrderWithClient[]) || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(orderId: string, newStatus: OrderStatus) {
    try {
      await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      setActionMenuOpen(null);
    } catch (error) {
      console.error('Erreur:', error);
    }
  }

  async function markDelivered(orderId: string) {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'livree',
          delivered_at: new Date().toISOString()
        })
        .eq('id', orderId);
      if (error) throw error;
      loadOrders();
      setActionMenuOpen(null);
    } catch (error) {
      console.error('Erreur:', error);
    }
  }

  async function openEditModal(order: OrderWithClient) {
    setEditOrder(order);
    setEditSlotId(order.delivery_slot_id || '');
    setEditItems([]);
    setEditLoading(true);
    setActionMenuOpen(null);

    const [{ data: itemsData }, slotsResult] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, quantity_ordered, unit_price, product_article:product_articles(display_name)')
        .eq('order_id', order.id)
        .order('created_at'),
      slots.length === 0
        ? supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order')
        : Promise.resolve({ data: null }),
    ]);

    if (slotsResult.data) setSlots(slotsResult.data);
    setEditItems(
      (itemsData || []).map((item: any) => ({
        id: item.id,
        display_name: item.product_article?.display_name || '',
        quantity_ordered: item.quantity_ordered,
        unit_price: item.unit_price,
      }))
    );
    setEditLoading(false);
  }

  async function saveEdit() {
    if (!editOrder) return;
    setEditLoading(true);
    try {
      const newTotal = editItems.reduce((sum, item) => sum + item.quantity_ordered * item.unit_price, 0);
      await Promise.all([
        supabase
          .from('orders')
          .update({ delivery_slot_id: editSlotId || null, total: newTotal })
          .eq('id', editOrder.id),
        ...editItems.map(item =>
          supabase.from('order_items').update({ quantity_ordered: item.quantity_ordered }).eq('id', item.id)
        ),
      ]);
      setEditOrder(null);
      loadOrders();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
    } finally {
      setEditLoading(false);
    }
  }

  async function setReminder(orderId: string, days: number | null) {
    const { error } = await supabase.from('orders').update({ reminder_days: days }).eq('id', orderId);
    if (error) { console.error('Rappel error:', error); return; }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, reminder_days: days } : o));
    setActionMenuOpen(null);
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map(o => o.id)));
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    try {
      await supabase.from('order_items').delete().in('order_id', ids);
      await supabase.from('orders').delete().in('id', ids);
      setOrders(prev => prev.filter(o => !selectedIds.has(o.id)));
      setSelectedIds(new Set());
      setSelectionMode(false);
      setDeleteConfirm(false);
    } catch (error) {
      console.error('Erreur suppression:', error);
    }
  }

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

  const filteredOrders = orders.filter(o => {
    const matchSearch = o.numero?.toLowerCase().includes(search.toLowerCase()) ||
                       o.client?.nom?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = selectedStatus === 'all' || o.status === selectedStatus;
    const matchDate = !selectedDate || o.delivery_date === selectedDate;
    return matchSearch && matchStatus && matchDate;
  }).sort((a, b) => {
    let valA: string | number = '';
    let valB: string | number = '';
    switch (sortKey) {
      case 'numero': valA = a.numero || ''; valB = b.numero || ''; break;
      case 'client': valA = a.client?.nom?.toLowerCase() || ''; valB = b.client?.nom?.toLowerCase() || ''; break;
      case 'date':   valA = a.delivery_date; valB = b.delivery_date; break;
      case 'total':  valA = a.total; valB = b.total; break;
      case 'statut': valA = a.status; valB = b.status; break;
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const getStatusStyle = (status: string) => {
    const s = ORDER_STATUSES.find(st => st.value === status);
    return s ? { color: s.color, bg: s.bgColor, label: s.label } : { color: '#6B7280', bg: '#F3F4F6', label: status };
  };

  // Fermer le menu quand on clique ailleurs
  useEffect(() => {
    const handleClick = () => setActionMenuOpen(null);
    if (actionMenuOpen) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [actionMenuOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
          <p className="text-gray-500 mt-1">{filteredOrders.length} commandes</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/recurrences"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={18} />
            Récurrentes
          </Link>
          <button
            onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); setDeleteConfirm(false); }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors ${
              selectionMode
                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CheckSquare size={18} />
            {selectionMode ? 'Annuler' : 'Sélection'}
          </button>
          <Link
            href="/commandes/nouvelle"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nouvelle commande
          </Link>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Recherche */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher (n° ou client)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Statut */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="all">Tous les statuts</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>

          {/* Date */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />

          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Effacer date
            </button>
          )}
        </div>
      </div>

      {/* Raccourcis statuts */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedStatus('all')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            selectedStatus === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Toutes
        </button>
        {ORDER_STATUSES.map((status) => (
          <button
            key={status.value}
            onClick={() => setSelectedStatus(status.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              selectedStatus === status.value
                ? 'text-white'
                : 'border hover:opacity-80'
            }`}
            style={{
              backgroundColor: selectedStatus === status.value ? status.color : status.bgColor,
              color: selectedStatus === status.value ? 'white' : status.color,
              borderColor: status.bgColor,
            }}
          >
            {status.label}
          </button>
        ))}
      </div>

      {/* Barre de sélection / suppression en masse */}
      {selectionMode && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm font-medium text-orange-700 hover:text-orange-900"
            >
              {selectedIds.size === filteredOrders.length && filteredOrders.length > 0
                ? <CheckSquare size={18} />
                : <Square size={18} />}
              {selectedIds.size === filteredOrders.length && filteredOrders.length > 0
                ? 'Tout désélectionner'
                : 'Tout sélectionner'}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-sm text-orange-600">{selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
            )}
          </div>
          {selectedIds.size > 0 && (
            !deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                <Trash2 size={16} />
                Supprimer ({selectedIds.size})
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-700 font-medium">Confirmer la suppression ?</span>
                <button
                  onClick={deleteSelected}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                >
                  Oui, supprimer
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Non
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Liste des commandes */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500">Aucune commande trouvée</p>
          <Link
            href="/commandes/nouvelle"
            className="inline-flex items-center gap-2 mt-4 text-blue-600 font-medium"
          >
            <Plus size={18} /> Créer une commande
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {selectionMode && <th className="px-4 py-4 w-10"></th>}
                  <th onClick={() => handleSort('numero')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">N° <SortIcon col="numero" /></span>
                  </th>
                  <th onClick={() => handleSort('client')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">Client <SortIcon col="client" /></span>
                  </th>
                  <th onClick={() => handleSort('date')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">Date <SortIcon col="date" /></span>
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Créneau</th>
                  <th onClick={() => handleSort('total')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">Total <SortIcon col="total" /></span>
                  </th>
                  <th onClick={() => handleSort('statut')} className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700">
                    <span className="flex items-center gap-1">Statut <SortIcon col="statut" /></span>
                  </th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map((order) => {
                  const style = getStatusStyle(order.status);
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-gray-50 transition-colors ${selectionMode && selectedIds.has(order.id) ? 'bg-orange-50' : ''}`}
                    >
                      {selectionMode && (
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleSelection(order.id)}
                            className="text-orange-500 hover:text-orange-700"
                          >
                            {selectedIds.has(order.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <Link href={`/commandes/${order.id}`} className="font-mono text-sm font-medium text-gray-900 hover:text-blue-600">
                          {order.numero}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-600">
                              {order.client?.nom?.charAt(0) || '?'}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900">
                            {order.client?.nom || 'Client inconnu'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar size={14} className="text-gray-400" />
                          {formatDate(order.delivery_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {order.delivery_slot
                          ? `${order.delivery_slot.name}`
                          : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">{formatPrice(order.total)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: style.bg, color: style.color }}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {/* Actions rapides selon le statut */}
                          {order.status === 'brouillon' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'confirmee'); }}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Confirmer"
                            >
                              <CheckCircle size={18} />
                            </button>
                          )}
                          {order.status === 'confirmee' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'production'); }}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="Mettre en production"
                            >
                              <Play size={18} />
                            </button>
                          )}
                          {(order.status === 'confirmee' || order.status === 'production') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markDelivered(order.id); }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Marquer livrée"
                            >
                              <Truck size={18} />
                            </button>
                          )}

                          {/* Menu plus d'options */}
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setActionMenuOpen(actionMenuOpen === order.id ? null : order.id); }}
                              className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreHorizontal size={18} />
                            </button>

                            {actionMenuOpen === order.id && (
                              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-10 min-w-[160px]">
                                <Link
                                  href={`/commandes/${order.id}`}
                                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  Voir détails
                                </Link>
                                {order.status !== 'livree' && order.status !== 'annulee' && (
                                  <button
                                    onClick={() => openEditModal(order)}
                                    className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                                  >
                                    <Pencil size={14} />
                                    Modifier
                                  </button>
                                )}
                                {order.status !== 'brouillon' && (
                                  <button
                                    onClick={() => updateStatus(order.id, 'brouillon')}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    Remettre en brouillon
                                  </button>
                                )}
                                {order.status !== 'confirmee' && order.status !== 'livree' && (
                                  <button
                                    onClick={() => updateStatus(order.id, 'confirmee')}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    Confirmer
                                  </button>
                                )}
                                {order.status !== 'production' && order.status !== 'livree' && (
                                  <button
                                    onClick={() => updateStatus(order.id, 'production')}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    En production
                                  </button>
                                )}
                                <div className="border-t border-gray-100 mt-1 pt-1">
                                  <p className="px-4 py-1 text-xs text-gray-400 flex items-center gap-1">
                                    <Bell size={11} /> Rappel avant livraison
                                  </p>
                                  {[
                                    { label: '1 jour avant', days: 1 },
                                    { label: '2 jours avant', days: 2 },
                                    { label: '1 semaine avant', days: 7 },
                                  ].map(({ label, days }) => (
                                    <button
                                      key={days}
                                      onClick={() => setReminder(order.id, order.reminder_days === days ? null : days)}
                                      className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                                        order.reminder_days === days
                                          ? 'text-orange-600 bg-orange-50'
                                          : 'text-gray-700 hover:bg-gray-50'
                                      }`}
                                    >
                                      {label}
                                      {order.reminder_days === days && <span className="text-xs">✓</span>}
                                    </button>
                                  ))}
                                </div>
                                {order.status !== 'annulee' && (
                                  <button
                                    onClick={() => updateStatus(order.id, 'annulee')}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100 mt-1"
                                  >
                                    Annuler
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Modal modifier commande */}
      {editOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Modifier la commande</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editOrder.numero} — {editOrder.client?.nom}</p>
              </div>
              <button
                onClick={() => setEditOrder(null)}
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {editLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Créneau */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Créneau de livraison</label>
                  <select
                    value={editSlotId}
                    onChange={e => setEditSlotId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— Sans créneau —</option>
                    {slots.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Articles */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantités</label>
                  <div className="space-y-2">
                    {editItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-xl">
                        <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">{item.display_name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity_ordered: Math.max(0, i.quantity_ordered - 1) } : i))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 font-bold"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={item.quantity_ordered}
                            onChange={e => setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity_ordered: Math.max(0, parseInt(e.target.value) || 0) } : i))}
                            className="w-14 text-center px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                          />
                          <button
                            onClick={() => setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity_ordered: i.quantity_ordered + 1 } : i))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nouveau total */}
                <div className="flex items-center justify-between py-3 border-t border-gray-100">
                  <span className="text-sm font-medium text-gray-600">Nouveau total</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatPrice(editItems.reduce((sum, item) => sum + item.quantity_ordered * item.unit_price, 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setEditOrder(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveEdit}
                disabled={editLoading}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
