'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Calendar, Plus, X, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Order, ORDER_STATUSES, RecurringOrder } from '@/types';
import { formatPrice, formatDate, getWeekDates } from '@/lib/utils';

export default function PlanningPage() {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [recurrences, setRecurrences] = useState<RecurringOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick view
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [selectedRecurrence, setSelectedRecurrence] = useState<any>(null);

  const weekDates = getWeekDates(weekStart);

  useEffect(() => { loadOrders(); }, [weekStart]);

  async function loadOrders() {
    setLoading(true);
    try {
      const startDate = weekDates[0].toISOString().split('T')[0];
      const endDate = weekDates[6].toISOString().split('T')[0];

      // Générer automatiquement les commandes récurrentes pour chaque jour de la semaine
      const today = new Date().toISOString().split('T')[0];
      for (const date of weekDates) {
        const d = date.toISOString().split('T')[0];
        if (d >= today) {
          await supabase.rpc('generate_orders_from_recurring', { target_date: d });
        }
      }

      const [{ data: ordersData }, { data: recurrencesData }] = await Promise.all([
        supabase
          .from('orders')
          .select('*, client:clients(nom), delivery_slot:delivery_slots(name, start_time)')
          .gte('delivery_date', startDate)
          .lte('delivery_date', endDate)
          .order('delivery_slot_id', { ascending: true, nullsFirst: false }),
        supabase
          .from('recurring_orders')
          .select('*, client:clients(nom), items:recurring_order_items(id, quantite, product_nom, delivery_slot_id)')
          .eq('is_active', true)
          .lte('date_debut', endDate),
      ]);

      setOrders(ordersData || []);
      setRecurrences(recurrencesData || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }

  async function openOrder(orderId: string) {
    setSelectedRecurrence(null);
    setSelectedOrderId(orderId);
    setLoadingOrder(true);
    try {
      const [{ data: orderData }, { data: itemsData }] = await Promise.all([
        supabase.from('orders').select('*, client:clients(*), delivery_slot:delivery_slots(*)').eq('id', orderId).single(),
        supabase.from('order_items').select('*, product_article:product_articles(display_name, product_reference:product_references(name))').eq('order_id', orderId).order('created_at'),
      ]);
      setSelectedOrder(orderData);
      setSelectedItems(itemsData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrder(false);
    }
  }

  function openRecurrence(rec: any) {
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setSelectedItems([]);
    setSelectedRecurrence(rec);
  }

  function closePanel() {
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setSelectedItems([]);
    setSelectedRecurrence(null);
  }

  const changeWeek = (weeks: number) => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + weeks * 7);
    setWeekStart(newDate);
  };

  const goToThisWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    setWeekStart(new Date(today.setDate(diff)));
  };

  const getOrdersForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return orders
      .filter(o => (o as any).delivery_date === dateStr)
      .sort((a, b) => {
        const aTime = (a as any).delivery_slot?.start_time ?? '99:99';
        const bTime = (b as any).delivery_slot?.start_time ?? '99:99';
        return aTime.localeCompare(bTime);
      });
  };

  const JOURS_MAP: Record<number, string> = { 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi', 0: 'dimanche' };

  const getRecurrencesForDate = (date: Date) => {
    const jourSemaine = JOURS_MAP[date.getDay()];
    return recurrences.filter(r => {
      const r_ = r as any;
      if (r_.type_recurrence === 'quotidien') return true;
      return (r_.jours_semaine || []).includes(jourSemaine);
    });
  };

  const isToday = (date: Date) => new Date().toDateString() === date.toDateString();

  const isInReminderWindow = (order: any) => {
    if (!order.reminder_days) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delivery = new Date(order.delivery_date);
    delivery.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= order.reminder_days;
  };

  const getStatusStyle = (statut: string) => {
    const s = ORDER_STATUSES.find(s => s.value === statut);
    return s ? { color: s.color, bg: s.bgColor, label: s.label } : { color: '#6B7280', bg: '#F3F4F6', label: statut };
  };

  const joursFr = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const panelOpen = !!(selectedOrderId || selectedRecurrence);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
          <p className="text-gray-500 mt-1">
            Semaine du {weekDates[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link href="/commandes/nouvelle" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
          <Plus size={20} />
          Nouvelle commande
        </Link>
      </div>

      {/* Navigation semaine */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-4">
            <button onClick={goToThisWeek} className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              Cette semaine
            </button>
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-gray-400" />
              <span className="text-lg font-semibold text-gray-900">
                {weekDates[0].toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
          <button onClick={() => changeWeek(1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {/* Grille + Panel */}
      <div className={`flex gap-4 transition-all ${panelOpen ? '' : ''}`}>
        {/* Grille semaine */}
        <div className={`flex-1 min-w-0 transition-all ${panelOpen ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {weekDates.map((date, index) => {
                const dayOrders = getOrdersForDate(date);
                const dayRecurrences = getRecurrencesForDate(date);
                const today = isToday(date);

                return (
                  <div
                    key={index}
                    className={`bg-white rounded-2xl border overflow-hidden ${today ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}
                  >
                    <div className={`px-3 py-3 border-b ${today ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-medium ${today ? 'text-blue-600' : 'text-gray-500'}`}>{joursFr[index]}</p>
                      <p className={`text-2xl font-bold ${today ? 'text-blue-600' : 'text-gray-900'}`}>{date.getDate()}</p>
                    </div>

                    <div className="p-2 min-h-[180px] space-y-1.5">
                      {dayOrders.map((order) => {
                        const o = order as any;
                        const style = getStatusStyle(o.status || o.statut);
                        const isSelected = selectedOrderId === order.id;
                        const reminder = isInReminderWindow(o);
                        return (
                          <button
                            key={order.id}
                            onClick={() => isSelected ? closePanel() : openOrder(order.id)}
                            className={`w-full text-left p-2 rounded-lg border transition-colors ${
                              isSelected
                                ? 'border-blue-400 bg-blue-50'
                                : reminder
                                  ? 'border-red-300 bg-red-50 hover:bg-red-100'
                                  : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50'
                            }`}
                          >
                            <span className="text-xs px-1.5 py-0.5 rounded block mb-1 w-fit" style={{ backgroundColor: style.bg, color: style.color }}>
                              {o.delivery_slot?.name || '—'}
                            </span>
                            <p className={`text-xs font-medium truncate ${reminder ? 'text-red-700' : 'text-gray-900'}`}>{o.client?.nom}</p>
                            <p className="text-xs text-gray-400">{formatPrice(order.total)}</p>
                            {reminder && (
                              <p className="text-xs text-red-500 font-medium mt-0.5">⏰ Rappel</p>
                            )}
                          </button>
                        );
                      })}

                      {dayOrders.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-4">-</p>
                      )}
                    </div>

                    {dayOrders.length > 0 && (
                      <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-100">
                        <p className="text-xs text-gray-400 text-center">{dayOrders.length} cmd</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick View Panel */}
        {panelOpen && (
          <div className="w-full lg:w-96 shrink-0 bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                {selectedOrder ? `Commande ${selectedOrder.numero || ''}` : selectedRecurrence?.nom || 'Récurrence'}
              </h3>
              <div className="flex items-center gap-2">
                {selectedOrder && (
                  <Link href={`/commandes/${selectedOrder.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ouvrir la page complète">
                    <ExternalLink size={16} />
                  </Link>
                )}
                {selectedRecurrence && (
                  <Link href={`/recurrences/${selectedRecurrence.id}`} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Modifier la récurrence">
                    <ExternalLink size={16} />
                  </Link>
                )}
                <button onClick={closePanel} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingOrder ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : selectedOrder ? (
                <>
                  {/* Infos commande */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Client</span>
                      <span className="font-medium text-gray-900">{selectedOrder.client?.nom}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Date</span>
                      <span className="font-medium text-gray-900">{formatDate(selectedOrder.delivery_date)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Créneau</span>
                      <span className="font-medium text-gray-900">{selectedOrder.delivery_slot?.name || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Statut</span>
                      {(() => {
                        const style = getStatusStyle(selectedOrder.status);
                        return (
                          <span className="text-sm px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: style.bg, color: style.color }}>
                            {style.label}
                          </span>
                        );
                      })()}
                    </div>
                    {selectedOrder.client?.telephone && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Tél</span>
                        <span className="font-medium text-gray-900">{selectedOrder.client.telephone}</span>
                      </div>
                    )}
                    {selectedOrder.note && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-sm text-gray-500 mb-1">Note</p>
                        <p className="text-sm text-gray-700">{selectedOrder.note}</p>
                      </div>
                    )}
                  </div>

                  {/* Articles */}
                  {selectedItems.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Articles ({selectedItems.length})</p>
                      <div className="space-y-2">
                        {selectedItems.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {item.product_article?.display_name || item.product_nom || '—'}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 ml-3 shrink-0">
                              × {item.quantity_ordered || item.quantite}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Total */}
                  <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-gray-900">{formatPrice(selectedOrder.total)}</span>
                  </div>
                </>
              ) : selectedRecurrence ? (
                <>
                  {/* Infos récurrence */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Client</span>
                      <span className="font-medium text-gray-900">{(selectedRecurrence as any).client?.nom}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Fréquence</span>
                      <span className="font-medium text-gray-900">
                        {selectedRecurrence.type_recurrence === 'quotidien'
                          ? 'Tous les jours'
                          : (selectedRecurrence.jours_semaine || []).map((j: string) => j.charAt(0).toUpperCase() + j.slice(1, 3)).join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Depuis</span>
                      <span className="font-medium text-gray-900">{formatDate(selectedRecurrence.date_debut)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Statut</span>
                      <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${selectedRecurrence.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {selectedRecurrence.is_active ? 'Active' : 'Suspendue'}
                      </span>
                    </div>
                  </div>

                  {/* Articles */}
                  {(selectedRecurrence as any).items?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Articles</p>
                      <div className="space-y-2">
                        {(selectedRecurrence as any).items.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                            <p className="text-sm text-gray-900 flex-1 truncate">{item.product_nom || '—'}</p>
                            <span className="text-sm font-semibold text-gray-900 ml-3 shrink-0">× {item.quantite}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-xl">
                      <RefreshCw size={16} className="text-orange-600 shrink-0" />
                      <p className="text-sm text-orange-700">Commande récurrente — non encore générée pour ce jour</p>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Résumé semaine */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Résumé de la semaine</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{orders.length}</p>
            <p className="text-sm text-gray-500">Commandes</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">{orders.filter(o => (o as any).status === 'confirmee').length}</p>
            <p className="text-sm text-gray-500">Confirmées</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-600">{orders.filter(o => (o as any).status === 'production').length}</p>
            <p className="text-sm text-gray-500">En production</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">{orders.filter(o => (o as any).status === 'livree').length}</p>
            <p className="text-sm text-gray-500">Livrées</p>
          </div>
        </div>
      </div>
    </div>
  );
}
