'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface OrderItem {
  quantity_ordered: number;
  unit_price: number;
  product_article: {
    display_name: string;
    product_reference: { atelier: string | null } | null;
  } | null;
}

interface DashboardOrder {
  id: string;
  status: string;
  total: number;
  delivery_date: string;
  client: { nom: string } | null;
  delivery_slot: { id: string; name: string; start_time: string; end_time: string } | null;
  items: OrderItem[];
}

interface SlimOrder {
  id: string;
  status: string;
  total: number;
}

// ── Data fetchers ──────────────────────────────────────────────────────────

async function getTodayOrders(): Promise<DashboardOrder[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('orders')
    .select(`
      id, status, total, delivery_date,
      client:clients(nom),
      delivery_slot:delivery_slots(id, name, start_time, end_time),
      items:order_items(
        quantity_ordered, unit_price,
        product_article:product_articles(
          display_name,
          product_reference:product_references(atelier)
        )
      )
    `)
    .eq('delivery_date', today)
    .neq('status', 'annulee');
  return (data as DashboardOrder[]) || [];
}

async function getYesterdayOrders(): Promise<SlimOrder[]> {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const { data } = await supabase
    .from('orders')
    .select('id, status, total')
    .eq('delivery_date', d.toISOString().split('T')[0])
    .neq('status', 'annulee');
  return (data as SlimOrder[]) || [];
}

async function getLateOrders(): Promise<SlimOrder[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('orders')
    .select('id, status, total')
    .lt('delivery_date', today)
    .not('status', 'in', '("livree","annulee")');
  return (data as SlimOrder[]) || [];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calcDelta(today: number, yesterday: number) {
  if (yesterday === 0) return { pct: today > 0 ? 100 : 0, dir: today > 0 ? 'up' : 'flat' } as const;
  const p = Math.round(((today - yesterday) / yesterday) * 100);
  return { pct: Math.abs(p), dir: p > 0 ? ('up' as const) : p < 0 ? ('down' as const) : ('flat' as const) };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-400 mb-1.5 leading-none">{label}</p>
      <p className={`text-xl font-black leading-none ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-300 mt-1.5 leading-none">{sub}</p>}
    </div>
  );
}

function KPIGrid({ orders, lateOrders }: { orders: DashboardOrder[]; lateOrders: SlimOrder[] }) {
  const ca = orders.reduce((s, o) => s + (o.total || 0), 0);
  const nb = orders.length;
  const livrees = orders.filter(o => o.status === 'livree').length;
  const restantes = orders.filter(o => o.status !== 'livree').length;
  const panierMoy = nb > 0 ? ca / nb : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KPICard label="CA du jour" value={formatPrice(ca)} />
      <KPICard label="Commandes" value={String(nb)} />
      <KPICard label="Livrées" value={String(livrees)} accent="text-green-600" />
      <KPICard
        label="Restantes"
        value={String(restantes)}
        accent={restantes > 0 ? 'text-amber-600' : 'text-gray-900'}
      />
      <KPICard
        label="En retard"
        value={String(lateOrders.length)}
        accent={lateOrders.length > 0 ? 'text-red-500' : 'text-gray-900'}
        sub="jours précédents"
      />
      <KPICard label="Panier moy." value={formatPrice(panierMoy)} />
    </div>
  );
}

function PerformanceStats({ orders }: { orders: DashboardOrder[] }) {
  const total = orders.length;
  const livrees = orders.filter(o => o.status === 'livree').length;
  const enCours = orders.filter(o => ['confirmee', 'production'].includes(o.status)).length;

  const txLivraison = total > 0 ? Math.round((livrees / total) * 100) : 0;
  const txProduction = total > 0 ? Math.round((enCours / total) * 100) : 0;
  const txCompletion = total > 0 ? Math.round(((livrees + enCours) / total) * 100) : 0;

  const stats = [
    { label: 'Livraison', value: `${txLivraison}%`, color: 'text-green-700', bg: 'bg-green-50', bar: 'bg-green-500', pct: txLivraison },
    { label: 'En production', value: `${txProduction}%`, color: 'text-orange-700', bg: 'bg-orange-50', bar: 'bg-orange-400', pct: txProduction },
    { label: 'Complétion', value: `${txCompletion}%`, color: 'text-blue-700', bg: 'bg-blue-50', bar: 'bg-blue-500', pct: txCompletion },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-800 mb-4">Performance</p>
      <div className="grid grid-cols-3 gap-3">
        {stats.map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3`}>
            <p className={`text-2xl font-black ${s.color} leading-none`}>{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-tight">{s.label}</p>
            <div className="h-1 bg-white/60 rounded-full mt-2 overflow-hidden">
              <div className={`h-full ${s.bar} rounded-full`} style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ATELIER_BAR_COLORS: Record<string, string> = {
  Boulangerie: 'bg-amber-400',
  Viennoiserie: 'bg-orange-400',
  'Pâtisserie': 'bg-pink-400',
  Chocolaterie: 'bg-rose-500',
  Traiteur: 'bg-teal-400',
};

function ProductionAnalysis({ orders }: { orders: DashboardOrder[] }) {
  const atelierMap = new Map<string, { ca: number; qty: number }>();
  let totalItems = 0;

  orders.forEach(order => {
    (order.items || []).forEach(item => {
      const atelier = item.product_article?.product_reference?.atelier || 'Autre';
      const lineCA = (item.unit_price || 0) * (item.quantity_ordered || 0);
      const prev = atelierMap.get(atelier) ?? { ca: 0, qty: 0 };
      atelierMap.set(atelier, { ca: prev.ca + lineCA, qty: prev.qty + (item.quantity_ordered || 0) });
      totalItems += item.quantity_ordered || 0;
    });
  });

  const totalCA = Array.from(atelierMap.values()).reduce((s, v) => s + v.ca, 0);
  const sorted = Array.from(atelierMap.entries()).sort((a, b) => b[1].ca - a[1].ca);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-800">Répartition CA</p>
        {totalItems > 0 && (
          <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg font-medium">
            {totalItems} articles
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-300">Aucune donnée de production</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map(([atelier, { ca, qty }]) => {
            const share = totalCA > 0 ? Math.round((ca / totalCA) * 100) : 0;
            const barColor = ATELIER_BAR_COLORS[atelier] ?? 'bg-gray-400';
            return (
              <div key={atelier}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-700 font-medium">{atelier}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-300">{qty} art.</span>
                    <span className="text-sm font-bold text-gray-900 w-9 text-right">{share}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} rounded-full transition-all duration-700`}
                    style={{ width: `${share}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-300 mt-1">{formatPrice(ca)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeliveryAnalysis({ orders }: { orders: DashboardOrder[] }) {
  const slotMap = new Map<string, { label: string; total: number; livrees: number }>();

  orders.forEach(order => {
    const key = order.delivery_slot?.id ?? '__none__';
    const label = order.delivery_slot
      ? `${order.delivery_slot.name} · ${order.delivery_slot.start_time.slice(0, 5)}–${order.delivery_slot.end_time.slice(0, 5)}`
      : 'Sans créneau';
    const prev = slotMap.get(key) ?? { label, total: 0, livrees: 0 };
    slotMap.set(key, {
      label,
      total: prev.total + 1,
      livrees: prev.livrees + (order.status === 'livree' ? 1 : 0),
    });
  });

  const slots = Array.from(slotMap.values()).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-800 mb-4">Analyse livraison</p>

      {slots.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-300">Aucune commande aujourd&apos;hui</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {slots.map(slot => {
            const pctVal = slot.total > 0 ? Math.round((slot.livrees / slot.total) * 100) : 0;
            const barColor =
              pctVal === 100 ? 'bg-green-500' : pctVal >= 50 ? 'bg-amber-400' : 'bg-red-400';
            const textColor =
              pctVal === 100 ? 'text-green-600' : pctVal >= 50 ? 'text-amber-600' : 'text-red-500';
            return (
              <div key={slot.label} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{slot.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {slot.livrees} / {slot.total} livrée{slot.livrees > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-700`}
                      style={{ width: `${pctVal}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-9 text-right ${textColor}`}>{pctVal}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopClients({ orders }: { orders: DashboardOrder[] }) {
  const clientMap = new Map<string, number>();
  orders.forEach(order => {
    const nom = order.client?.nom ?? 'Inconnu';
    clientMap.set(nom, (clientMap.get(nom) ?? 0) + (order.total || 0));
  });

  const top5 = Array.from(clientMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const max = top5[0]?.[1] ?? 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-800 mb-4">Top clients du jour</p>

      {top5.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-300">Aucune commande aujourd&apos;hui</p>
        </div>
      ) : (
        <div className="space-y-4">
          {top5.map(([nom, ca], i) => (
            <div key={nom} className="flex items-center gap-3">
              <span className="w-5 text-xs font-bold text-gray-200 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-gray-900 truncate">{nom}</p>
                  <p className="text-sm font-bold text-gray-900 ml-3 shrink-0">{formatPrice(ca)}</p>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.round((ca / max) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ dir, pct }: { dir: 'up' | 'down' | 'flat'; pct: number }) {
  if (dir === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-medium">
        <Minus size={10} />0%
      </span>
    );
  }
  if (dir === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold">
        <TrendingUp size={11} />+{pct}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold">
      <TrendingDown size={11} />-{pct}%
    </span>
  );
}

function ComparisonBar({
  todayOrders, yesterdayOrders,
}: { todayOrders: DashboardOrder[]; yesterdayOrders: SlimOrder[] }) {
  const caToday = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const caYesterday = yesterdayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const nbToday = todayOrders.length;
  const nbYesterday = yesterdayOrders.length;

  const caDelta = calcDelta(caToday, caYesterday);
  const nbDelta = calcDelta(nbToday, nbYesterday);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-800 mb-4">Comparaison hier</p>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-gray-400 mb-1">CA aujourd&apos;hui</p>
          <p className="text-lg font-black text-gray-900 leading-none">{formatPrice(caToday)}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <DeltaBadge dir={caDelta.dir} pct={caDelta.pct} />
            <span className="text-[11px] text-gray-300">{formatPrice(caYesterday)} hier</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Commandes</p>
          <p className="text-lg font-black text-gray-900 leading-none">{nbToday}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <DeltaBadge dir={nbDelta.dir} pct={nbDelta.pct} />
            <span className="text-[11px] text-gray-300">{nbYesterday} hier</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AnalysePage() {
  const [todayOrders, setTodayOrders] = useState<DashboardOrder[]>([]);
  const [yesterdayOrders, setYesterdayOrders] = useState<SlimOrder[]>([]);
  const [lateOrders, setLateOrders] = useState<SlimOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [today, yesterday, late] = await Promise.all([
        getTodayOrders(),
        getYesterdayOrders(),
        getLateOrders(),
      ]);
      setTodayOrders(today);
      setYesterdayOrders(yesterday);
      setLateOrders(late);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-none">Analyse</h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">{dateLabel}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50 shadow-sm shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span className="text-xs">
            {loading
              ? 'Chargement…'
              : lastRefresh
                ? lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                : '—'}
          </span>
        </button>
      </div>

      {/* Skeleton initial */}
      {loading && todayOrders.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* KPI row */}
          <KPIGrid orders={todayOrders} lateOrders={lateOrders} />

          {/* Performance + Comparaison */}
          <div className="grid lg:grid-cols-2 gap-4">
            <PerformanceStats orders={todayOrders} />
            <ComparisonBar todayOrders={todayOrders} yesterdayOrders={yesterdayOrders} />
          </div>

          {/* Production + Livraison */}
          <div className="grid lg:grid-cols-2 gap-4">
            <ProductionAnalysis orders={todayOrders} />
            <DeliveryAnalysis orders={todayOrders} />
          </div>

          {/* Top clients */}
          <TopClients orders={todayOrders} />

          {/* Footnote */}
          <p className="text-center text-[11px] text-gray-200 pb-2">
            Données du jour · hors commandes annulées
          </p>
        </>
      )}
    </div>
  );
}
