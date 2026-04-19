'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Package, Layers, Calendar, ChevronDown, FileText, Printer, AlertTriangle, BadgeDollarSign, CheckCircle, Banknote, ChevronRight } from 'lucide-react';
import BLModal from '@/components/livraisons/BLModal';
import type { BLOrder } from '@/components/livraisons/BonLivraison';
import { useAppSettings } from '@/lib/useAppSettings';
import { supabase } from '@/lib/supabase/client';
import {
  REPORT_PERIODS,
  ReportPeriod,
  getReportDateRange,
  SalesReportByArticle,
  ProductionReportByReference,
  ProductionReportByAtelier,
} from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { formatPrice, formatDate, formatNumber } from '@/lib/utils';
import { useUser } from '@/contexts/UserContext';

type ReportView = 'articles' | 'references' | 'ateliers' | 'bons_livraison' | 'commandes_incompletes' | 'commissions';

interface Commission {
  id: string;
  type: 'first_order' | 'recurring';
  amount: number;
  rate: number;
  status: 'pending' | 'validated' | 'paid';
  bl_generated_at: string;
  created_at: string;
  user: { id: string; first_name: string; last_name: string } | null;
  client: { id: string; nom: string; raison_sociale: string | null; code: string | null } | null;
  order: { id: string; numero: string; delivery_date: string; total: number } | null;
}

interface IncompleteOrderItem {
  display_name: string;
  quantity_ordered: number;
  quantity_delivered: number;
  missing: number;
}

interface IncompleteOrder {
  id: string;
  client_nom: string;
  delivery_date: string;
  missing_items: IncompleteOrderItem[];
}

interface MissingProductStat {
  display_name: string;
  total_missing: number;
  occurrence_count: number;
  clients: string[];
}

interface BLRecord {
  id: string;
  numero: string;
  order_id: string | null;
  client_nom: string | null;
  delivery_date: string;
  items: Array<{ display_name: string; vat_rate: number; unit_price: number; quantity: number }>;
  created_at: string;
}

export default function RapportsPage() {
  const { ateliers, getStyle: getAtelierStyle } = useAteliers();
  const { settings } = useAppSettings();
  const { profile } = useUser();
  const isAdmin = profile?.role === 'admin';
  const [view, setView] = useState<ReportView>('articles');
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedAtelier, setSelectedAtelier] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const [salesByArticle, setSalesByArticle] = useState<SalesReportByArticle[]>([]);
  const [productionByRef, setProductionByRef] = useState<ProductionReportByReference[]>([]);
  const [productionByAtelier, setProductionByAtelier] = useState<ProductionReportByAtelier[]>([]);
  const [blRecords, setBlRecords] = useState<BLRecord[]>([]);
  const [previewBL, setPreviewBL] = useState<BLOrder | null>(null);
  const [incompleteOrders, setIncompleteOrders] = useState<IncompleteOrder[]>([]);
  const [missingProductStats, setMissingProductStats] = useState<MissingProductStat[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [selectedCommissions, setSelectedCommissions] = useState<Set<string>>(new Set());
  const [updatingCommissions, setUpdatingCommissions] = useState(false);

  const dateRange = getReportDateRange(period, customStart, customEnd);

  useEffect(() => {
    loadData();
  }, [period, customStart, customEnd, view]);

  async function loadData() {
    setLoading(true);
    try {
      if (view === 'articles') {
        const { data, error } = await supabase.rpc('get_sales_report', {
          p_start_date: dateRange.start,
          p_end_date: dateRange.end
        });
        if (error) throw error;
        setSalesByArticle(data || []);
      } else if (view === 'references') {
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('id')
          .gte('delivery_date', dateRange.start)
          .lte('delivery_date', dateRange.end)
          .in('status', ['confirmee', 'production', 'livree']);
        if (ordersError) throw ordersError;

        const orderIds = (ordersData || []).map((o: any) => o.id);
        if (orderIds.length === 0) { setProductionByRef([]); return; }

        const { data: items, error: itemsError } = await supabase
          .from('order_items')
          .select(`
            quantity_ordered,
            quantity_delivered,
            article_unit_quantity,
            product_article:product_articles(
              product_reference:product_references(code, name, atelier)
            )
          `)
          .in('order_id', orderIds);
        if (itemsError) throw itemsError;

        const refMap = new Map<string, ProductionReportByReference>();
        (items || []).forEach((item: any) => {
          const ref = item.product_article?.product_reference;
          if (!ref) return;
          const key = `${ref.code}-${ref.atelier}`;
          const unitsOrdered = (item.quantity_ordered || 0) * (item.article_unit_quantity || 1);
          const unitsDelivered = (item.quantity_delivered || 0) * (item.article_unit_quantity || 1);
          const existing = refMap.get(key);
          if (existing) {
            existing.total_units_ordered += unitsOrdered;
            existing.total_units_delivered += unitsDelivered;
          } else {
            refMap.set(key, {
              reference_code: ref.code,
              reference_name: ref.name,
              atelier: ref.atelier,
              total_units_ordered: unitsOrdered,
              total_units_delivered: unitsDelivered,
            });
          }
        });
        setProductionByRef(
          Array.from(refMap.values()).sort(
            (a, b) => a.atelier.localeCompare(b.atelier) || a.reference_name.localeCompare(b.reference_name)
          )
        );
      } else if (view === 'ateliers') {
        const { data, error } = await supabase
          .from('v_production_by_atelier')
          .select('*')
          .gte('delivery_date', dateRange.start)
          .lte('delivery_date', dateRange.end)
          .order('delivery_date');
        if (error) throw error;
        setProductionByAtelier(data || []);
      } else if (view === 'bons_livraison') {
        const { data, error } = await supabase
          .from('bons_livraison')
          .select('*')
          .gte('delivery_date', dateRange.start)
          .lte('delivery_date', dateRange.end)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setBlRecords((data as BLRecord[]) || []);
      } else if (view === 'commandes_incompletes') {
        const { data: ordersData, error } = await supabase
          .from('orders')
          .select(`
            id, delivery_date,
            client:clients(nom),
            items:order_items(
              quantity_ordered, quantity_delivered,
              product_article:product_articles(display_name)
            )
          `)
          .gte('delivery_date', dateRange.start)
          .lte('delivery_date', dateRange.end)
          .eq('status', 'livree');
        if (error) throw error;

        const rawOrders = (ordersData || []) as any[];
        const incomplete = rawOrders.filter(o =>
          (o.items || []).some((i: any) => i.quantity_delivered !== null && i.quantity_delivered < i.quantity_ordered)
        );

        setIncompleteOrders(incomplete.map(o => ({
          id: o.id,
          client_nom: o.client?.nom ?? '—',
          delivery_date: o.delivery_date,
          missing_items: (o.items || [])
            .filter((i: any) => i.quantity_delivered !== null && i.quantity_delivered < i.quantity_ordered)
            .map((i: any) => ({
              display_name: i.product_article?.display_name ?? '—',
              quantity_ordered: i.quantity_ordered,
              quantity_delivered: i.quantity_delivered,
              missing: i.quantity_ordered - i.quantity_delivered,
            })),
        })));

        const productMap = new Map<string, { total_missing: number; occurrences: number; clients: Set<string> }>();
        incomplete.forEach((o: any) => {
          (o.items || [])
            .filter((i: any) => i.quantity_delivered !== null && i.quantity_delivered < i.quantity_ordered)
            .forEach((i: any) => {
              const name = i.product_article?.display_name ?? '—';
              const existing = productMap.get(name) ?? { total_missing: 0, occurrences: 0, clients: new Set<string>() };
              existing.total_missing += i.quantity_ordered - i.quantity_delivered;
              existing.occurrences += 1;
              existing.clients.add(o.client?.nom ?? '—');
              productMap.set(name, existing);
            });
        });
        setMissingProductStats(
          Array.from(productMap.entries())
            .map(([name, s]) => ({ display_name: name, total_missing: s.total_missing, occurrence_count: s.occurrences, clients: Array.from(s.clients) }))
            .sort((a, b) => b.occurrence_count - a.occurrence_count)
        );
      } else if (view === 'commissions') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/commissions?start=${dateRange.start}&end=${dateRange.end}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        setCommissions(json.data || []);
        setSelectedCommissions(new Set());
      }
    } catch (error: any) {
      console.error('Erreur chargement:', error?.message || error?.code || JSON.stringify(error));
    } finally {
      setLoading(false);
    }
  }

  const filteredSales = selectedAtelier === 'all'
    ? salesByArticle
    : salesByArticle.filter(s => s.atelier === selectedAtelier);

  const filteredProduction = selectedAtelier === 'all'
    ? productionByRef
    : productionByRef.filter(p => p.atelier === selectedAtelier);

  const filteredAtelierStats = selectedAtelier === 'all'
    ? productionByAtelier
    : productionByAtelier.filter(p => p.atelier === selectedAtelier);

  const totals = {
    revenue: filteredSales.reduce((acc, s) => acc + s.total_revenue, 0),
    unitsOrdered: filteredSales.reduce((acc, s) => acc + s.total_units, 0),
    unitsDelivered: filteredSales.reduce((acc, s) => acc + s.total_delivered, 0),
  };

  const periodLabel = REPORT_PERIODS.find(p => p.value === period)?.label || '';

  async function handleCommissionStatus(status: 'validated' | 'paid') {
    if (selectedCommissions.size === 0) return;
    setUpdatingCommissions(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ids: Array.from(selectedCommissions), status }),
      });
      setCommissions(prev => prev.map(c => selectedCommissions.has(c.id) ? { ...c, status } : c));
      setSelectedCommissions(new Set());
    } finally {
      setUpdatingCommissions(false);
    }
  }

  // Agrégats commissions par commercial (admin)
  const commissionsByUser = commissions.reduce((acc, c) => {
    const uid = c.user?.id ?? 'unknown';
    if (!acc[uid]) acc[uid] = { user: c.user, pending: 0, validated: 0, paid: 0, total: 0 };
    acc[uid][c.status] += c.amount;
    acc[uid].total += c.amount;
    return acc;
  }, {} as Record<string, { user: Commission['user']; pending: number; validated: number; paid: number; total: number }>);

  return (
    <div className="space-y-4 lg:space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Rapports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(dateRange.start)} – {formatDate(dateRange.end)}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="space-y-3">
        {/* Tabs vue */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {([
            { key: 'articles',              label: 'Par article',    icon: Package },
            { key: 'references',            label: 'Par référence',  icon: Layers },
            { key: 'ateliers',              label: 'Par atelier',    icon: BarChart3 },
            { key: 'bons_livraison',        label: 'BL édités',      icon: FileText },
            { key: 'commandes_incompletes', label: 'Incomplètes',    icon: AlertTriangle },
            { key: 'commissions',           label: 'Commissions',    icon: BadgeDollarSign },
          ] as { key: ReportView; label: string; icon: React.ComponentType<{ size?: number }> }[]).map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  view === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Période + atelier */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
              className="pl-8 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
            >
              {REPORT_PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400 text-sm">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="relative">
            <select
              value={selectedAtelier}
              onChange={(e) => setSelectedAtelier(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
            >
              <option value="all">Tous les ateliers</option>
              {ateliers.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Stats résumées — articles uniquement */}
      {view === 'articles' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingUp className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{formatPrice(totals.revenue)}</p>
              <p className="text-xs text-gray-500">Chiffre d'affaires</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{formatNumber(totals.unitsOrdered)}</p>
              <p className="text-xs text-gray-500">Unités commandées</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package className="text-emerald-600" size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{formatNumber(totals.unitsDelivered)}</p>
              <p className="text-xs text-gray-500">Unités livrées</p>
            </div>
          </div>
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Rapport par article */}
          {view === 'articles' && (
            <>
              {filteredSales.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  {/* Cards mobile */}
                  <div className="space-y-2 lg:hidden">
                    {filteredSales.map((sale, index) => {
                      const atelierStyle = getAtelierStyle(sale.atelier);
                      return (
                        <div key={index} className="bg-white rounded-2xl border border-gray-100 p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm leading-tight">{sale.reference_name}</p>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{sale.article_display_name}</p>
                            </div>
                            <span
                              className="flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium"
                              style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}
                            >
                              {atelierStyle.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center bg-gray-50 rounded-xl p-2">
                              <p className="text-base font-bold text-gray-900">{sale.total_ordered}</p>
                              <p className="text-xs text-gray-500">Commandé</p>
                            </div>
                            <div className="text-center bg-gray-50 rounded-xl p-2">
                              <p className="text-base font-bold text-gray-900">{sale.total_delivered}</p>
                              <p className="text-xs text-gray-500">Livré</p>
                            </div>
                            <div className="text-center bg-green-50 rounded-xl p-2">
                              <p className="text-base font-bold text-green-700">{formatPrice(sale.total_revenue)}</p>
                              <p className="text-xs text-gray-500">CA</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tableau desktop */}
                  <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Article</th>
                          <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Atelier</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Commandé</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Livré</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Unités</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">CA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSales.map((sale, index) => {
                          const atelierStyle = getAtelierStyle(sale.atelier);
                          return (
                            <tr key={index} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{sale.reference_name}</p>
                                <p className="text-sm text-gray-500">{sale.article_display_name}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}>
                                  {atelierStyle.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium">{sale.total_ordered}</td>
                              <td className="px-4 py-3 text-right font-medium">{sale.total_delivered}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatNumber(sale.total_units)}</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatPrice(sale.total_revenue)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* Rapport par référence */}
          {view === 'references' && (
            <>
              {filteredProduction.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  {/* Cards mobile */}
                  <div className="space-y-2 lg:hidden">
                    {filteredProduction.map((prod, index) => {
                      const atelierStyle = getAtelierStyle(prod.atelier);
                      const deliveryRate = prod.total_units_ordered > 0
                        ? Math.round((prod.total_units_delivered / prod.total_units_ordered) * 100)
                        : 0;
                      return (
                        <div key={index} className="bg-white rounded-2xl border border-gray-100 p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm">{prod.reference_name}</p>
                              <p className="text-xs text-gray-400 font-mono mt-0.5">{prod.reference_code}</p>
                            </div>
                            <span
                              className="flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium"
                              style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}
                            >
                              {atelierStyle.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-center bg-blue-50 rounded-xl p-2">
                              <p className="text-lg font-bold text-blue-700">{formatNumber(prod.total_units_ordered)}</p>
                              <p className="text-xs text-gray-500">Commandé</p>
                            </div>
                            <div className="text-center bg-emerald-50 rounded-xl p-2">
                              <p className="text-lg font-bold text-emerald-700">{formatNumber(prod.total_units_delivered)}</p>
                              <p className="text-xs text-gray-500">Livré · {deliveryRate}%</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tableau desktop */}
                  <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Référence</th>
                          <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Atelier</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Unités commandées</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Unités livrées</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProduction.map((prod, index) => {
                          const atelierStyle = getAtelierStyle(prod.atelier);
                          return (
                            <tr key={index} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-mono text-sm text-gray-500">{prod.reference_code}</p>
                                <p className="font-medium text-gray-900">{prod.reference_name}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}>
                                  {atelierStyle.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-bold">{formatNumber(prod.total_units_ordered)}</td>
                              <td className="px-4 py-3 text-right font-bold">{formatNumber(prod.total_units_delivered)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* Rapport par atelier */}
          {view === 'ateliers' && (
            <div className="space-y-3">
              {filteredAtelierStats.length === 0 ? (
                <EmptyState />
              ) : (
                ateliers
                  .filter(a => selectedAtelier === 'all' || a.value === selectedAtelier)
                  .map(atelier => {
                    const atelierData = filteredAtelierStats.filter(p => p.atelier === atelier.value);
                    if (atelierData.length === 0) return null;

                    const totalUnitsOrdered = atelierData.reduce((acc, d) => acc + d.total_units_ordered, 0);
                    const totalUnitsDelivered = atelierData.reduce((acc, d) => acc + d.total_units_delivered, 0);
                    const totalRefs = atelierData.reduce((acc, d) => acc + d.total_references, 0);

                    return (
                      <div key={atelier.value} className="bg-white rounded-2xl border border-gray-100 p-4">
                        {/* En-tête atelier */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: atelier.bg_color }}>
                            <Layers style={{ color: atelier.color }} size={20} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{atelier.label}</h3>
                            <p className="text-xs text-gray-500">{totalRefs} références</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-gray-900">{formatNumber(totalUnitsOrdered)}</p>
                            <p className="text-xs text-gray-500">unités cmd.</p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-blue-700">{formatNumber(totalUnitsOrdered)}</p>
                            <p className="text-xs text-gray-500">Commandées</p>
                          </div>
                          <div className="bg-emerald-50 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-emerald-700">{formatNumber(totalUnitsDelivered)}</p>
                            <p className="text-xs text-gray-500">Livrées</p>
                          </div>
                        </div>

                        {/* Jours — scroll horizontal */}
                        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                          {atelierData.map((day, idx) => (
                            <div key={idx} className="flex-shrink-0 text-center px-3 py-2 bg-gray-50 rounded-xl min-w-[56px]">
                              <p className="text-xs text-gray-500 mb-1">{formatDate(day.delivery_date).split(' ')[0]}</p>
                              <p className="font-bold text-gray-900 text-sm">{day.total_units_ordered}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          )}
          {/* BL édités */}
          {view === 'bons_livraison' && (
            blRecords.length === 0 ? <EmptyState /> : (
              <>
                {/* Mobile */}
                <div className="space-y-2 lg:hidden">
                  {blRecords.map(bl => {
                    const totalHT = (bl.items || []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
                    const totalTTC = (bl.items || []).reduce((s, i) => s + i.unit_price * i.quantity * (1 + i.vat_rate / 100), 0);
                    return (
                      <div key={bl.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{bl.numero}</p>
                            <p className="text-xs text-gray-500">{bl.client_nom ?? '—'}</p>
                          </div>
                          <button onClick={() => setPreviewBL({ numero: bl.numero, delivery_date: bl.delivery_date, client: { nom: bl.client_nom ?? '—' }, items: bl.items || [], logoUrl: settings.logo_url, company: { raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege, code_postal: settings.code_postal, ville_siege: settings.ville_siege, telephone_societe: settings.telephone_societe, email_societe: settings.email_societe, site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal, ice_societe: settings.ice_societe, tp: settings.tp } })}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Printer size={15} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{new Date(bl.delivery_date).toLocaleDateString('fr-FR')}</span>
                          <span className="font-semibold text-gray-800">{formatPrice(totalTTC)} TTC</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop */}
                <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Référence</th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Client</th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Date</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Total HT</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Total TTC</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {blRecords.map(bl => {
                        const totalHT = (bl.items || []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
                        const totalTTC = (bl.items || []).reduce((s, i) => s + i.unit_price * i.quantity * (1 + i.vat_rate / 100), 0);
                        const blOrder: BLOrder = { numero: bl.numero, delivery_date: bl.delivery_date, client: { nom: bl.client_nom ?? '—' }, items: bl.items || [], logoUrl: settings.logo_url, company: { raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege, code_postal: settings.code_postal, ville_siege: settings.ville_siege, telephone_societe: settings.telephone_societe, email_societe: settings.email_societe, site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal, ice_societe: settings.ice_societe, tp: settings.tp } };
                        return (
                          <tr key={bl.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900">{bl.numero}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{bl.client_nom ?? '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{new Date(bl.delivery_date).toLocaleDateString('fr-FR')}</td>
                            <td className="px-4 py-3 text-right text-sm">{formatPrice(totalHT)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatPrice(totalTTC)}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => setPreviewBL(blOrder)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                <Printer size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-100">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-600">{blRecords.length} BL</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                          {formatPrice(blRecords.reduce((s, bl) => s + (bl.items || []).reduce((ss, i) => ss + i.unit_price * i.quantity, 0), 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {formatPrice(blRecords.reduce((s, bl) => s + (bl.items || []).reduce((ss, i) => ss + i.unit_price * i.quantity * (1 + i.vat_rate / 100), 0), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )
          )}
          {/* Commandes incomplètes */}
          {view === 'commandes_incompletes' && (
            incompleteOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="text-green-400" size={24} />
                </div>
                <p className="text-gray-500">Aucune commande incomplète sur cette période</p>
              </div>
            ) : (
              <div className="space-y-4">

                {/* Résumé */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-2xl font-black text-orange-500">{incompleteOrders.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Commandes incomplètes</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-2xl font-black text-gray-900">{missingProductStats.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Produits concernés</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-2xl font-black text-gray-900">
                      {missingProductStats.reduce((s, p) => s + p.total_missing, 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Unités manquantes</p>
                  </div>
                </div>

                {/* Produits souvent manquants */}
                {missingProductStats.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-800 text-sm">Produits fréquemment manquants</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {missingProductStats.map((p, i) => (
                        <div key={i} className="px-4 py-3 flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {p.occurrence_count}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.display_name}</p>
                            <p className="text-xs text-gray-400 truncate">{p.clients.slice(0, 3).join(', ')}{p.clients.length > 3 ? ` +${p.clients.length - 3}` : ''}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-orange-600">−{p.total_missing}</p>
                            <p className="text-xs text-gray-400">{p.occurrence_count > 1 ? `${p.occurrence_count} fois` : '1 fois'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Liste des commandes */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="font-semibold text-gray-800 text-sm">Détail des commandes</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {incompleteOrders.map(order => (
                      <div key={order.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-gray-900 text-sm">{order.client_nom}</p>
                          <p className="text-xs text-gray-400">{new Date(order.delivery_date).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div className="space-y-1">
                          {order.missing_items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600 truncate flex-1 mr-2">{item.display_name}</span>
                              <span className="flex-shrink-0 text-orange-600 font-semibold">
                                {item.quantity_delivered}/{item.quantity_ordered} <span className="text-gray-400 font-normal">(−{item.missing})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )
          )}

          {/* Vue Commissions */}
          {view === 'commissions' && (
            commissions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <BadgeDollarSign className="mx-auto mb-3 text-gray-300" size={32} />
                <p className="text-gray-500 text-sm">Aucune commission sur cette période</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Résumé par commercial (admin seulement) */}
                {isAdmin && Object.keys(commissionsByUser).length > 0 && (
                  <div className="space-y-2">
                    {Object.values(commissionsByUser).map(u => (
                      <div key={u.user?.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-semibold text-gray-900 text-sm">{u.user?.first_name} {u.user?.last_name}</p>
                          <p className="text-lg font-black text-gray-900">{formatPrice(u.total)}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-amber-50 rounded-xl px-3 py-2 text-center">
                            <p className="text-sm font-bold text-amber-700">{formatPrice(u.pending)}</p>
                            <p className="text-[10px] text-amber-600 mt-0.5">En attente</p>
                          </div>
                          <div className="bg-blue-50 rounded-xl px-3 py-2 text-center">
                            <p className="text-sm font-bold text-blue-700">{formatPrice(u.validated)}</p>
                            <p className="text-[10px] text-blue-600 mt-0.5">Validée</p>
                          </div>
                          <div className="bg-emerald-50 rounded-xl px-3 py-2 text-center">
                            <p className="text-sm font-bold text-emerald-700">{formatPrice(u.paid)}</p>
                            <p className="text-[10px] text-emerald-600 mt-0.5">Payée</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions admin (valider / payer) */}
                {isAdmin && selectedCommissions.size > 0 && (
                  <div className="flex gap-2 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                    <span className="text-sm text-blue-700 font-medium flex-1">{selectedCommissions.size} sélectionnée(s)</span>
                    <button
                      onClick={() => handleCommissionStatus('validated')}
                      disabled={updatingCommissions}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      <CheckCircle size={13} /> Valider
                    </button>
                    <button
                      onClick={() => handleCommissionStatus('paid')}
                      disabled={updatingCommissions}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      <Banknote size={13} /> Payer
                    </button>
                  </div>
                )}

                {/* Liste détaillée */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {commissions.map(c => (
                      <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            className="mt-1 w-4 h-4 rounded accent-blue-600 flex-shrink-0"
                            checked={selectedCommissions.has(c.id)}
                            onChange={e => setSelectedCommissions(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(c.id) : next.delete(c.id);
                              return next;
                            })}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              c.type === 'first_order' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {c.type === 'first_order' ? '1ère commande' : 'Récurrent'}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              c.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              c.status === 'validated' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {c.status === 'paid' ? 'Payée' : c.status === 'validated' ? 'Validée' : 'En attente'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {c.client?.raison_sociale || c.client?.nom || '—'}
                            </p>
                            {c.client?.code && <span className="text-xs text-gray-400 flex-shrink-0">{c.client.code}</span>}
                          </div>
                          {isAdmin && c.user && (
                            <p className="text-xs text-gray-400">{c.user.first_name} {c.user.last_name}</p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-400">{c.order?.numero} · {c.order?.delivery_date ? formatDate(c.order.delivery_date) : '—'}</p>
                            <span className="text-xs text-gray-300">·</span>
                            <p className="text-xs text-gray-400">{c.rate}% sur {formatPrice(c.order?.total ?? 0)}</p>
                          </div>
                        </div>
                        <p className="text-base font-black text-gray-900 flex-shrink-0">{formatPrice(c.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}

      {previewBL && (
        <BLModal orders={[previewBL]} title={`BL — ${previewBL.client.nom}`} onClose={() => setPreviewBL(null)} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <BarChart3 className="text-gray-400" size={24} />
      </div>
      <p className="text-gray-500">Aucune donnée pour cette période</p>
    </div>
  );
}
