'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Package, Layers, Calendar, Download } from 'lucide-react';
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

type ReportView = 'articles' | 'references' | 'ateliers';

export default function RapportsPage() {
  const { ateliers, getStyle: getAtelierStyle } = useAteliers();
  const [view, setView] = useState<ReportView>('articles');
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedAtelier, setSelectedAtelier] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Data states
  const [salesByArticle, setSalesByArticle] = useState<SalesReportByArticle[]>([]);
  const [productionByRef, setProductionByRef] = useState<ProductionReportByReference[]>([]);
  const [productionByAtelier, setProductionByAtelier] = useState<ProductionReportByAtelier[]>([]);

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
        // Fetch orders in date range
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('id')
          .gte('delivery_date', dateRange.start)
          .lte('delivery_date', dateRange.end)
          .in('status', ['confirmee', 'production', 'livree']);
        if (ordersError) throw ordersError;

        const orderIds = (ordersData || []).map((o: any) => o.id);
        if (orderIds.length === 0) {
          setProductionByRef([]);
          return;
        }

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

        // Aggregate client-side by reference + atelier
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
        const sorted = Array.from(refMap.values()).sort(
          (a, b) => a.atelier.localeCompare(b.atelier) || a.reference_name.localeCompare(b.reference_name)
        );
        setProductionByRef(sorted);
      } else if (view === 'ateliers') {
        const { data, error } = await supabase
          .from('v_production_by_atelier')
          .select('*')
          .gte('delivery_date', dateRange.start)
          .lte('delivery_date', dateRange.end)
          .order('delivery_date');
        if (error) throw error;
        setProductionByAtelier(data || []);
      }
    } catch (error: any) {
      console.error('Erreur chargement:', error?.message || error?.code || JSON.stringify(error));
    } finally {
      setLoading(false);
    }
  }

  // Filtrer par atelier si nécessaire
  const filteredSales = selectedAtelier === 'all'
    ? salesByArticle
    : salesByArticle.filter(s => s.atelier === selectedAtelier);

  const filteredProduction = selectedAtelier === 'all'
    ? productionByRef
    : productionByRef.filter(p => p.atelier === selectedAtelier);

  const filteredAtelierStats = selectedAtelier === 'all'
    ? productionByAtelier
    : productionByAtelier.filter(p => p.atelier === selectedAtelier);

  // Calculer les totaux
  const totals = {
    revenue: filteredSales.reduce((acc, s) => acc + s.total_revenue, 0),
    unitsOrdered: filteredSales.reduce((acc, s) => acc + s.total_units, 0),
    unitsDelivered: filteredSales.reduce((acc, s) => acc + s.total_delivered, 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapports</h1>
          <p className="text-gray-500 mt-1">
            {formatDate(dateRange.start)} - {formatDate(dateRange.end)}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
        {/* Vue */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setView('articles')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              view === 'articles'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Package size={16} />
            Par article
          </button>
          <button
            onClick={() => setView('references')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              view === 'references'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Layers size={16} />
            Par référence
          </button>
          <button
            onClick={() => setView('ateliers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              view === 'ateliers'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <BarChart3 size={16} />
            Par atelier
          </button>
        </div>

        {/* Période + Atelier */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
              className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {REPORT_PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <select
            value={selectedAtelier}
            onChange={(e) => setSelectedAtelier(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">Tous les ateliers</option>
            {ateliers.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats résumées */}
      {view === 'articles' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatPrice(totals.revenue)}</p>
                <p className="text-sm text-gray-500">Chiffre d'affaires</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Package className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(totals.unitsOrdered)}</p>
                <p className="text-sm text-gray-500">Unités commandées</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Package className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(totals.unitsDelivered)}</p>
                <p className="text-sm text-gray-500">Unités livrées</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Rapport par article */}
          {view === 'articles' && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
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
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        Aucune donnée pour cette période
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale, index) => {
                      const atelierStyle = getAtelierStyle(sale.atelier);
                      return (
                        <tr key={index} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{sale.reference_name}</p>
                              <p className="text-sm text-gray-500">{sale.article_display_name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="text-xs px-2 py-1 rounded-full font-medium"
                              style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}
                            >
                              {atelierStyle.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{sale.total_ordered}</td>
                          <td className="px-4 py-3 text-right font-medium">{sale.total_delivered}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatNumber(sale.total_units)}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{formatPrice(sale.total_revenue)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Rapport par référence */}
          {view === 'references' && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
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
                  {filteredProduction.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        Aucune donnée pour cette période
                      </td>
                    </tr>
                  ) : (
                    filteredProduction.map((prod, index) => {
                      const atelierStyle = getAtelierStyle(prod.atelier);
                      return (
                        <tr key={index} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-mono text-sm text-gray-500">{prod.reference_code}</p>
                              <p className="font-medium text-gray-900">{prod.reference_name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="text-xs px-2 py-1 rounded-full font-medium"
                              style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}
                            >
                              {atelierStyle.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold">{formatNumber(prod.total_units_ordered)}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatNumber(prod.total_units_delivered)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Rapport par atelier */}
          {view === 'ateliers' && (
            <div className="space-y-4">
              {filteredAtelierStats.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <p className="text-gray-500">Aucune donnée pour cette période</p>
                </div>
              ) : (
                ateliers.filter(a => selectedAtelier === 'all' || a.value === selectedAtelier).map(atelier => {
                  const atelierData = filteredAtelierStats.filter(p => p.atelier === atelier.value);
                  if (atelierData.length === 0) return null;

                  const totalUnitsOrdered = atelierData.reduce((acc, d) => acc + d.total_units_ordered, 0);
                  const totalUnitsDelivered = atelierData.reduce((acc, d) => acc + d.total_units_delivered, 0);
                  const totalRefs = atelierData.reduce((acc, d) => acc + d.total_references, 0);

                  return (
                    <div key={atelier.value} className="bg-white rounded-2xl border border-gray-100 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: atelier.bg_color }}
                          >
                            <Layers style={{ color: atelier.color }} size={20} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{atelier.label}</h3>
                            <p className="text-sm text-gray-500">{totalRefs} références sur la période</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{formatNumber(totalUnitsOrdered)}</p>
                          <p className="text-sm text-gray-500">unités commandées</p>
                        </div>
                      </div>

                      {/* Mini tableau par jour */}
                      <div className="grid grid-cols-7 gap-2">
                        {atelierData.slice(0, 7).map((day, idx) => (
                          <div key={idx} className="text-center p-2 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">{formatDate(day.delivery_date).split(' ')[0]}</p>
                            <p className="font-bold text-gray-900">{day.total_units_ordered}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
