'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Calendar, Plus, X, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { ORDER_STATUSES } from '@/types';
import { formatPrice, formatDate, getWeekDates } from '@/lib/utils';

interface PlanningEntry {
  id: string;
  client_nom: string;
  date: string;
  slot_name: string | null;
  slot_start: string | null;
  statut: string;
  total: number;
  is_preview: boolean;
  order_id: string | null;
  recurring_order_id: string | null;
  version_id: string | null;
  reminder_days?: number | null;
}

export default function PlanningPage() {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  });
  const [entries, setEntries] = useState<PlanningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEntry, setSelectedEntry] = useState<PlanningEntry | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);

  const weekDates = getWeekDates(weekStart);

  useEffect(() => { loadData(); }, [weekStart]);

  async function loadData() {
    setLoading(true);
    try {
      const startDate = weekDates[0].toISOString().split('T')[0];
      const endDate = weekDates[6].toISOString().split('T')[0];

      const [
        { data: ordersData },
        { data: recurringData },
        { data: existingRecOrders },
      ] = await Promise.all([
        supabase
          .from('orders')
          .select('*, client:clients(nom), delivery_slot:delivery_slots(name, start_time)')
          .gte('delivery_date', startDate)
          .lte('delivery_date', endDate),
        // Récurrences actives dont la date_debut est avant la fin de semaine
        supabase
          .from('recurring_orders')
          .select('id, type_recurrence, jours_semaine, date_debut, date_fin, delivery_slot_id, client:clients(nom), delivery_slot:delivery_slots(name, start_time)')
          .eq('is_active', true)
          .lte('date_debut', endDate),
        // Commandes réelles issues de récurrences cette semaine (pour éviter les doublons)
        supabase
          .from('orders')
          .select('recurring_order_id, delivery_date')
          .gte('delivery_date', startDate)
          .lte('delivery_date', endDate)
          .not('recurring_order_id', 'is', null),
      ]);

      // Index pour détecter rapidement un doublon preview/réel
      const existingSet = new Set<string>(
        (existingRecOrders || []).map((o: any) => `${o.recurring_order_id}|${o.delivery_date}`)
      );

      const orderEntries: PlanningEntry[] = (ordersData || []).map((o: any) => ({
        id: o.id,
        client_nom: o.client?.nom ?? '',
        date: o.delivery_date,
        slot_name: o.delivery_slot?.name ?? null,
        slot_start: o.delivery_slot?.start_time ?? null,
        statut: o.status,
        total: o.total,
        is_preview: false,
        order_id: o.id,
        recurring_order_id: o.recurring_order_id ?? null,
        version_id: null,
        reminder_days: o.reminder_days ?? null,
      }));

      // Calcul des previews côté client — 7 jours × N récurrences
      const JOURS_JS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const previewEntries: PlanningEntry[] = [];

      for (const date of weekDates) {
        const dateStr = date.toISOString().split('T')[0];
        const dayFr = JOURS_JS[date.getDay()];

        for (const rec of (recurringData || []) as any[]) {
          if (rec.date_debut > dateStr) continue;
          if (rec.date_fin && rec.date_fin < dateStr) continue;
          if (rec.type_recurrence === 'hebdo' && !rec.jours_semaine.includes(dayFr)) continue;
          if (existingSet.has(`${rec.id}|${dateStr}`)) continue;

          previewEntries.push({
            id: `preview-${rec.id}-${dateStr}`,
            client_nom: (rec.client as any)?.nom ?? '',
            date: dateStr,
            slot_name: (rec.delivery_slot as any)?.name ?? null,
            slot_start: (rec.delivery_slot as any)?.start_time ?? null,
            statut: 'confirmee',
            total: 0,
            is_preview: true,
            order_id: null,
            recurring_order_id: rec.id,
            version_id: null,
          });
        }
      }

      setEntries([...orderEntries, ...previewEntries]);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }

  async function openEntry(entry: PlanningEntry) {
    if (selectedEntry?.id === entry.id) {
      closePanel();
      return;
    }
    setSelectedEntry(entry);
    setSelectedOrder(null);
    setSelectedItems([]);
    setLoadingPanel(true);

    try {
      if (!entry.is_preview && entry.order_id) {
        const [{ data: orderData }, { data: itemsData }] = await Promise.all([
          supabase.from('orders').select('*, client:clients(*), delivery_slot:delivery_slots(*)').eq('id', entry.order_id).single(),
          supabase.from('order_items').select('*, product_article:product_articles(display_name, product_reference:product_references(name))').eq('order_id', entry.order_id).order('created_at'),
        ]);
        setSelectedOrder(orderData);
        setSelectedItems(itemsData || []);
      } else if (entry.is_preview && entry.recurring_order_id) {
        const { data: itemsData } = await supabase
          .from('recurring_order_items')
          .select('*, product_article:product_articles!product_article_id(display_name)')
          .eq('recurring_order_id', entry.recurring_order_id);
        setSelectedItems(itemsData || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPanel(false);
    }
  }

  function closePanel() {
    setSelectedEntry(null);
    setSelectedOrder(null);
    setSelectedItems([]);
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

  const getEntriesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return entries
      .filter(e => e.date === dateStr)
      .sort((a, b) => (a.slot_start ?? '99:99').localeCompare(b.slot_start ?? '99:99'));
  };

  const isToday = (date: Date) => new Date().toDateString() === date.toDateString();

  const isInReminderWindow = (entry: PlanningEntry) => {
    if (!entry.reminder_days) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delivery = new Date(entry.date);
    delivery.setHours(0, 0, 0, 0);
    const diff = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= entry.reminder_days;
  };

  const getStatusStyle = (statut: string) => {
    const s = ORDER_STATUSES.find(s => s.value === statut);
    return s ? { color: s.color, bg: s.bgColor, label: s.label } : { color: '#6B7280', bg: '#F3F4F6', label: statut };
  };

  const joursFr = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const panelOpen = !!selectedEntry;
  const realOrders = entries.filter(e => !e.is_preview);

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
      <div className="flex gap-4">
        <div className={`flex-1 min-w-0 ${panelOpen ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* ── Vue mobile : liste verticale par jour ── */}
              <div className="lg:hidden space-y-2">
                {weekDates.map((date, index) => {
                  const dayEntries = getEntriesForDate(date);
                  const today = isToday(date);
                  return (
                    <div
                      key={index}
                      className={`bg-white rounded-2xl border overflow-hidden ${today ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}
                    >
                      {/* En-tête du jour */}
                      <div className={`flex items-center justify-between px-4 py-3 ${today ? 'bg-blue-50' : 'bg-gray-50'} border-b border-gray-100`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-2xl font-bold leading-none ${today ? 'text-blue-600' : 'text-gray-900'}`}>
                            {date.getDate()}
                          </span>
                          <div>
                            <p className={`text-sm font-semibold ${today ? 'text-blue-600' : 'text-gray-700'}`}>
                              {joursFr[index]}
                              {today && <span className="ml-1.5 text-xs font-normal text-blue-400">Aujourd'hui</span>}
                            </p>
                            <p className="text-xs text-gray-400">
                              {date.toLocaleDateString('fr-FR', { month: 'long' })}
                            </p>
                          </div>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${dayEntries.length > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                          {dayEntries.length > 0 ? `${dayEntries.length} cmd` : '—'}
                        </span>
                      </div>

                      {/* Entrées du jour */}
                      {dayEntries.length > 0 && (
                        <div className="divide-y divide-gray-50">
                          {dayEntries.map(entry => {
                            const style = getStatusStyle(entry.statut);
                            const isSelected = selectedEntry?.id === entry.id;
                            const reminder = isInReminderWindow(entry);
                            return (
                              <button
                                key={entry.id}
                                onClick={() => openEntry(entry)}
                                className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors active:bg-gray-50 ${
                                  isSelected ? 'bg-blue-50' : reminder ? 'bg-red-50' : ''
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className={`font-semibold text-sm truncate ${reminder ? 'text-red-700' : 'text-gray-900'}`}>
                                    {entry.client_nom}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: style.bg, color: style.color }}>
                                      {entry.slot_name || '—'}
                                    </span>
                                    {!entry.is_preview && (
                                      <span className="text-xs text-gray-400">{formatPrice(entry.total)}</span>
                                    )}
                                    {reminder && <span className="text-xs text-red-500 font-semibold">⏰ Rappel</span>}
                                  </div>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Vue desktop : grille 7 colonnes ── */}
              <div className="hidden lg:grid grid-cols-7 gap-2">
                {weekDates.map((date, index) => {
                  const dayEntries = getEntriesForDate(date);
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
                        {dayEntries.map((entry) => {
                          const style = getStatusStyle(entry.statut);
                          const isSelected = selectedEntry?.id === entry.id;
                          const reminder = isInReminderWindow(entry);
                          return (
                            <button
                              key={entry.id}
                              onClick={() => openEntry(entry)}
                              className={`w-full text-left p-2 rounded-lg border transition-colors ${
                                isSelected
                                  ? 'border-blue-400 bg-blue-50'
                                  : reminder
                                    ? 'border-red-300 bg-red-50 hover:bg-red-100'
                                    : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50'
                              }`}
                            >
                              <span className="text-xs px-1.5 py-0.5 rounded block mb-1 w-fit" style={{ backgroundColor: style.bg, color: style.color }}>
                                {entry.slot_name || '—'}
                              </span>
                              <p className={`text-xs font-medium truncate ${reminder ? 'text-red-700' : 'text-gray-900'}`}>
                                {entry.client_nom}
                              </p>
                              {!entry.is_preview && (
                                <p className="text-xs text-gray-400">{formatPrice(entry.total)}</p>
                              )}
                              {reminder && (
                                <p className="text-xs text-red-500 font-medium mt-0.5">⏰ Rappel</p>
                              )}
                            </button>
                          );
                        })}

                        {dayEntries.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-4">-</p>
                        )}
                      </div>

                      {dayEntries.length > 0 && (
                        <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-100">
                          <p className="text-xs text-gray-400 text-center">{dayEntries.length} cmd</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Panel */}
        {panelOpen && selectedEntry && (
          <div className="w-full lg:w-96 shrink-0 bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                {selectedOrder ? `Commande ${selectedOrder.numero || ''}` : selectedEntry.client_nom}
              </h3>
              <div className="flex items-center gap-2">
                {selectedOrder && (
                  <Link href={`/commandes/${selectedOrder.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ouvrir la commande">
                    <ExternalLink size={16} />
                  </Link>
                )}
                {selectedEntry.is_preview && selectedEntry.recurring_order_id && (
                  <Link href={`/recurrences/${selectedEntry.recurring_order_id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Modifier la récurrence">
                    <ExternalLink size={16} />
                  </Link>
                )}
                <button onClick={closePanel} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingPanel ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : selectedOrder ? (
                <>
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

                  {selectedItems.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Articles ({selectedItems.length})</p>
                      <div className="space-y-2">
                        {selectedItems.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                            <p className="text-sm font-medium text-gray-900 truncate flex-1">
                              {item.product_article?.display_name || item.product_nom || '—'}
                            </p>
                            <span className="text-sm font-semibold text-gray-900 ml-3 shrink-0">
                              × {item.quantity_ordered ?? item.quantite}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-gray-900">{formatPrice(selectedOrder.total)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Client</span>
                      <span className="font-medium text-gray-900">{selectedEntry.client_nom}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Date</span>
                      <span className="font-medium text-gray-900">{formatDate(selectedEntry.date)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Créneau</span>
                      <span className="font-medium text-gray-900">{selectedEntry.slot_name || '—'}</span>
                    </div>
                  </div>

                  {selectedItems.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Articles ({selectedItems.length})</p>
                      <div className="space-y-2">
                        {selectedItems.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                            <p className="text-sm text-gray-900 flex-1 truncate">
                              {item.product_article?.display_name || item.product_nom || '—'}
                            </p>
                            <span className="text-sm font-semibold text-gray-900 ml-3 shrink-0">× {item.quantite}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedItems.length === 0 && !loadingPanel && (
                    <p className="text-sm text-gray-400 text-center py-4">Aucun article configuré</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Résumé semaine */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Résumé de la semaine</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{realOrders.length}</p>
            <p className="text-sm text-gray-500">Commandes</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">{realOrders.filter(e => e.statut === 'confirmee').length}</p>
            <p className="text-sm text-gray-500">Confirmées</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-600">{realOrders.filter(e => e.statut === 'production').length}</p>
            <p className="text-sm text-gray-500">En production</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">{realOrders.filter(e => e.statut === 'livree').length}</p>
            <p className="text-sm text-gray-500">Livrées</p>
          </div>
        </div>
      </div>
    </div>
  );
}
