'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Clock,
  Play,
  Truck,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  ChevronLeft,
  Euro,
  StickyNote,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { ORDER_STATUSES, OrderStatus } from '@/types';
import { formatPrice } from '@/lib/utils';

interface OrderItem {
  quantity_ordered: number;
  product_article: { display_name: string } | null;
}

interface SlotOrder {
  id: string;
  numero: string;
  status: OrderStatus;
  total: number;
  delivery_sequence: number | null;
  note: string | null;
  client: { nom: string; telephone: string | null } | null;
  delivery_slot: { id: string; name: string; start_time: string; end_time: string } | null;
  items: OrderItem[];
}

interface SlotGroup {
  slot: { id: string; name: string; start_time: string; end_time: string } | null;
  orders: SlotOrder[];
}

function offsetDate(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = offsetDate(today, 1);
  const yesterday = offsetDate(today, -1);
  if (dateStr === today) return "Aujourd'hui";
  if (dateStr === tomorrow) return 'Demain';
  if (dateStr === yesterday) return 'Hier';
  return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDayFull(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Dashboard() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(todayStr);
  const [groups, setGroups] = useState<SlotGroup[]>([]);
  const [totalCA, setTotalCA] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set());
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);

  const loadDashboard = useCallback(async (targetDate: string, signal: AbortSignal) => {
    setLoading(true);
    try {
      if (targetDate >= todayStr) {
        await supabase.rpc('generate_orders_from_recurring', { target_date: targetDate });
      }
      if (signal.aborted) return;

      const { data } = await supabase
        .from('orders')
        .select(`
          id, numero, status, total, delivery_sequence, note,
          client:clients(nom, telephone),
          delivery_slot:delivery_slots(id, name, start_time, end_time),
          items:order_items(quantity_ordered, product_article:product_articles(display_name))
        `)
        .eq('delivery_date', targetDate)
        .not('status', 'eq', 'annulee')
        .order('delivery_sequence', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (signal.aborted) return;

      const orders = (data as SlotOrder[]) || [];

      setTotalCA(orders.reduce((sum, o) => sum + (o.total || 0), 0));

      const grouped = new Map<string, SlotGroup>();
      orders.forEach(order => {
        const slotId = order.delivery_slot?.id ?? '__none__';
        if (!grouped.has(slotId)) {
          grouped.set(slotId, { slot: order.delivery_slot, orders: [] });
        }
        grouped.get(slotId)!.orders.push(order);
      });

      const sorted = Array.from(grouped.values()).sort((a, b) => {
        if (!a.slot) return 1;
        if (!b.slot) return -1;
        return a.slot.start_time.localeCompare(b.slot.start_time);
      });

      setGroups(sorted.filter(g => g.orders.length > 0));
    } catch (error) {
      if (!signal.aborted) console.error('Erreur dashboard:', error);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(date, controller.signal);
    return () => controller.abort();
  }, [date, loadDashboard]);

  async function generateRecurring() {
    setGenerating(true);
    try {
      await supabase.rpc('generate_orders_from_recurring', { target_date: date });
      await loadDashboard(date, new AbortController().signal);
    } finally {
      setGenerating(false);
    }
  }

  async function updateStatus(orderId: string, newStatus: OrderStatus) {
    setUpdatingOrder(orderId);
    try {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'livree') updates.delivered_at = new Date().toISOString();

      await supabase.from('orders').update(updates).eq('id', orderId);

      setGroups(prev => prev.map(g => ({
        ...g,
        orders: g.orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o),
      })));
    } finally {
      setUpdatingOrder(null);
    }
  }

  function toggleSlot(slotId: string) {
    setCollapsedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  const allOrders = groups.flatMap(g => g.orders);
  const totalOrders = allOrders.length;
  const livrees = allOrders.filter(o => o.status === 'livree').length;
  const aProduire = allOrders.filter(o => o.status === 'brouillon' || o.status === 'confirmee').length;
  const enProduction = allOrders.filter(o => o.status === 'production').length;
  const progressPct = totalOrders > 0 ? Math.round((livrees / totalOrders) * 100) : 0;
  const isToday = date === todayStr;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* Header + navigation date */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(d => offsetDate(d, -1))}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center min-w-[160px]">
            <p className="font-bold text-gray-900 text-lg leading-tight capitalize">
              {formatDateLabel(date)}
            </p>
            {!isToday && (
              <p className="text-xs text-gray-400 capitalize">{formatDayFull(date)}</p>
            )}
          </div>
          <button
            onClick={() => setDate(d => offsetDate(d, 1))}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              onClick={() => setDate(todayStr)}
              className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition-colors"
            >
              Aujourd&apos;hui
            </button>
          )}
          <Link
            href="/commandes/nouvelle"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            Nouvelle
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Barre de progression + CA */}
          {totalOrders > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">
                    {livrees}/{totalOrders} livrée{livrees > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm text-gray-400">{progressPct}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-700 font-semibold">
                  <Euro size={15} className="text-gray-400" />
                  {formatPrice(totalCA)}
                </div>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Compteurs inline */}
              <div className="flex items-center gap-4 mt-3 text-sm">
                {aProduire > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <Clock size={13} />
                    {aProduire} à produire
                  </span>
                )}
                {enProduction > 0 && (
                  <span className="flex items-center gap-1.5 text-orange-600">
                    <Play size={13} />
                    {enProduction} en cours
                  </span>
                )}
                {livrees > 0 && (
                  <span className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle size={13} />
                    {livrees} livrée{livrees > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Commandes groupées par créneau */}
          {totalOrders === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="text-gray-400" size={24} />
              </div>
              <p className="text-gray-600 font-medium">
                Aucune commande {isToday ? "aujourd'hui" : 'ce jour'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {isToday ? 'Créez une commande ou générez les récurrentes' : 'Aucune commande prévue'}
              </p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <Link
                  href="/commandes/nouvelle"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  <Plus size={16} /> Créer
                </Link>
                {date >= todayStr && (
                  <button
                    onClick={generateRecurring}
                    disabled={generating}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-medium hover:bg-indigo-100 transition-colors disabled:opacity-60"
                  >
                    <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
                    Récurrences
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const slotKey = group.slot?.id ?? '__none__';
                const isCollapsed = collapsedSlots.has(slotKey);
                const slotLabel = group.slot
                  ? `${group.slot.name}  ${group.slot.start_time.slice(0, 5)}–${group.slot.end_time.slice(0, 5)}`
                  : 'Sans créneau';
                const slotLivrees = group.orders.filter(o => o.status === 'livree').length;

                return (
                  <div key={slotKey} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {/* En-tête créneau */}
                    <button
                      onClick={() => toggleSlot(slotKey)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Truck size={15} className="text-gray-400 shrink-0" />
                        <span className="font-semibold text-gray-800">{slotLabel}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                          {slotLivrees}/{group.orders.length}
                        </span>
                      </div>
                      {isCollapsed
                        ? <ChevronRight size={16} className="text-gray-400" />
                        : <ChevronDown size={16} className="text-gray-400" />
                      }
                    </button>

                    {/* Lignes commandes */}
                    {!isCollapsed && (
                      <div className="divide-y divide-gray-50">
                        {group.orders.map(order => {
                          const statusInfo = ORDER_STATUSES.find(s => s.value === order.status);
                          const isUpdating = updatingOrder === order.id;
                          const preview = order.items
                            ?.slice(0, 3)
                            .map(i => `${i.product_article?.display_name ?? '?'} ×${i.quantity_ordered}`)
                            .join(' · ');
                          const hasMoreItems = (order.items?.length ?? 0) > 3;

                          return (
                            <div key={order.id} className={`px-5 py-4 transition-colors ${isUpdating ? 'opacity-60' : ''}`}>
                              <div className="flex items-start gap-3">
                                {/* Infos client */}
                                <Link href={`/commandes/${order.id}`} className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-gray-900">
                                      {order.client?.nom ?? 'Client inconnu'}
                                    </p>
                                    <span
                                      className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                                      style={{ backgroundColor: statusInfo?.bgColor, color: statusInfo?.color }}
                                    >
                                      {statusInfo?.label}
                                    </span>
                                  </div>

                                  {/* Aperçu articles */}
                                  {preview && (
                                    <p className="text-sm text-gray-500 mt-0.5 truncate">
                                      {preview}{hasMoreItems ? ' …' : ''}
                                    </p>
                                  )}

                                  {/* Note */}
                                  {order.note && (
                                    <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                      <StickyNote size={11} />
                                      {order.note}
                                    </p>
                                  )}

                                  <p className="text-xs text-gray-400 mt-1">
                                    {order.numero} · {formatPrice(order.total)}
                                  </p>
                                </Link>

                                {/* Actions rapides */}
                                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                  {order.status === 'brouillon' && (
                                    <button
                                      onClick={() => updateStatus(order.id, 'confirmee')}
                                      disabled={isUpdating}
                                      title="Confirmer"
                                      className="p-2 rounded-xl text-green-600 hover:bg-green-50 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                      <CheckCircle size={22} />
                                    </button>
                                  )}
                                  {order.status === 'confirmee' && (
                                    <button
                                      onClick={() => updateStatus(order.id, 'production')}
                                      disabled={isUpdating}
                                      title="Mettre en production"
                                      className="p-2 rounded-xl text-orange-600 hover:bg-orange-50 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                      <Play size={22} />
                                    </button>
                                  )}
                                  {(order.status === 'confirmee' || order.status === 'production') && (
                                    <button
                                      onClick={() => updateStatus(order.id, 'livree')}
                                      disabled={isUpdating}
                                      title="Marquer livrée"
                                      className="p-2 rounded-xl text-blue-600 hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                      <Truck size={22} />
                                    </button>
                                  )}
                                  {order.status === 'livree' && (
                                    <div className="p-2 text-green-500">
                                      <CheckCircle size={22} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Génération récurrences discrète (si date présente/future) */}
              {date >= todayStr && (
                <button
                  onClick={generateRecurring}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
                  {generating ? 'Génération…' : 'Regénérer les récurrences'}
                </button>
              )}
            </div>
          )}

          {/* Raccourcis */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Link
              href="/production"
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/40 transition-all"
            >
              <Play className="text-orange-500 shrink-0" size={20} />
              <span className="font-medium text-gray-700">Production</span>
            </Link>
            <Link
              href="/livraisons"
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-all"
            >
              <Truck className="text-blue-500 shrink-0" size={20} />
              <span className="font-medium text-gray-700">Livraisons</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
