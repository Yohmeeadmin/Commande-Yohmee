'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, X } from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { formatPrice } from '@/lib/utils';
import { usePermissions } from '@/lib/permissions';

// ── Types ──────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'last_month';

interface OrderItem {
  quantity_ordered: number;
  quantity_delivered: number | null;
  unit_price: number;
  product_article: {
    display_name: string;
    product_reference_id: string | null;
    product_reference: { atelier: string | null } | null;
  } | null;
}

interface DashboardOrder {
  id: string;
  status: string;
  total: number;
  delivery_date: string;
  client: { nom: string } | null;
  items: OrderItem[];
}

interface IngCost {
  quantite: number;
  stock_item_id: string | null;
  sous_recipe_id: string | null;
  stock_item: { prix_moyen_pondere: number | null; unite: string; poids_unitaire_g: number | null } | null;
}

interface RecipeCostData {
  id: string;
  product_reference_id: string | null;
  rendement: number;
  perte_pct: number;
  type: string;
  ingredients: IngCost[];
}

interface EcoOrder {
  id: string;
  total: number;
  client: { nom: string } | null;
  items: { quantity_ordered: number; product_article: { display_name: string; product_reference_id: string | null } | null }[];
}

interface EcoResult {
  ca: number;
  coutMatiere: number;
  margeBrute: number;
  ndRefs: string[];
}

interface ChargesTotaux {
  rh: number;
  fixes: number;
  energie: number;
  variables: number;
  total: number;
}

interface TrendPoint {
  date: string;
  label: string;
  ca: number;
}

// ── Helpers date ───────────────────────────────────────────────────────────

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function toYYYYMM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodDates(period: Period) {
  const today = new Date();
  const todayStr = localDate();
  const pad = (n: number) => String(n).padStart(2, '0');

  if (period === 'today') return { start: todayStr, end: todayStr, mois: toYYYYMM(today), label: "Aujourd'hui" };

  if (period === 'week') {
    const d = new Date(today);
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    d.setDate(d.getDate() + diff);
    return { start: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, end: todayStr, mois: toYYYYMM(today), label: 'Cette semaine' };
  }

  if (period === 'month') {
    return { start: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`, end: todayStr, mois: toYYYYMM(today), label: 'Ce mois' };
  }

  // last_month
  const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    start: `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}-01`,
    end: `${lmEnd.getFullYear()}-${pad(lmEnd.getMonth() + 1)}-${pad(lmEnd.getDate())}`,
    mois: toYYYYMM(lm),
    label: 'Mois précédent',
  };
}

// ── Calcul coût matière ────────────────────────────────────────────────────

function ingToKg(ing: IngCost): number {
  if (ing.sous_recipe_id) return ing.quantite;
  const si = ing.stock_item;
  if (!si) return 0;
  switch (si.unite) {
    case 'kg': return ing.quantite;
    case 'g': return ing.quantite / 1000;
    case 'L': return ing.quantite;
    case 'mL': return ing.quantite / 1000;
    case 'pièce': return ing.quantite * (si.poids_unitaire_g || 0) / 1000;
    default: return ing.quantite;
  }
}

function calcSRCostPerKg(sr: RecipeCostData, allSR: RecipeCostData[], depth = 0): number {
  if (depth > 5) return 0;
  let cost = 0; let kgIn = 0;
  for (const ing of sr.ingredients) {
    if (ing.sous_recipe_id) {
      const n = allSR.find(x => x.id === ing.sous_recipe_id);
      if (n) cost += ing.quantite * calcSRCostPerKg(n, allSR, depth + 1);
      kgIn += ing.quantite;
    } else if (ing.stock_item) {
      cost += ing.quantite * (ing.stock_item.prix_moyen_pondere ?? 0);
      kgIn += ingToKg(ing);
    }
  }
  const kgOut = kgIn * (1 - (sr.perte_pct || 0) / 100) / (sr.rendement || 1);
  return kgOut > 0 ? cost / kgOut : 0;
}

function calcCostPerUnit(r: RecipeCostData, allSR: RecipeCostData[]): number | null {
  if (!r.ingredients.length) return null;
  let cost = 0;
  for (const ing of r.ingredients) {
    if (ing.sous_recipe_id) {
      const sr = allSR.find(x => x.id === ing.sous_recipe_id);
      if (sr) cost += ing.quantite * calcSRCostPerKg(sr, allSR);
    } else if (ing.stock_item) {
      cost += ing.quantite * (ing.stock_item.prix_moyen_pondere ?? 0);
    }
  }
  return cost / (r.rendement || 1);
}

// Cache des coûts par product_reference_id (évite de recalculer à chaque render)
function buildCostCache(recipes: RecipeCostData[], srs: RecipeCostData[]): Map<string, number | null> {
  const cache = new Map<string, number | null>();
  for (const r of recipes) {
    if (r.product_reference_id) cache.set(r.product_reference_id, calcCostPerUnit(r, srs));
  }
  return cache;
}

function computeEco(orders: EcoOrder[], costCache: Map<string, number | null>): EcoResult {
  let ca = 0; let cout = 0;
  const nd = new Set<string>();
  for (const o of orders) {
    ca += o.total || 0;
    for (const item of o.items || []) {
      const refId = item.product_article?.product_reference_id;
      const name = item.product_article?.display_name || 'Inconnu';
      if (!refId) { nd.add(name); continue; }
      if (!costCache.has(refId)) { nd.add(name); continue; }
      const cpu = costCache.get(refId);
      if (cpu === null || cpu === undefined) { nd.add(name); continue; }
      cout += cpu * (item.quantity_ordered || 0);
    }
  }
  return { ca, coutMatiere: cout, margeBrute: ca - cout, ndRefs: Array.from(nd) };
}

// ── Fetchers ───────────────────────────────────────────────────────────────

async function fetchOrders(start: string, end: string): Promise<DashboardOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(`
      id, status, total, delivery_date,
      client:clients(nom),
      items:order_items(
        quantity_ordered, quantity_delivered, unit_price,
        product_article:product_articles(
          display_name, product_reference_id,
          product_reference:product_references(atelier)
        )
      )
    `)
    .gte('delivery_date', start).lte('delivery_date', end).neq('status', 'annulee');
  return (data as DashboardOrder[]) || [];
}

async function fetchEcoOrders(start: string, end: string): Promise<EcoOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(`id, total, client:clients(nom), items:order_items(quantity_ordered, product_article:product_articles(display_name, product_reference_id))`)
    .gte('delivery_date', start).lte('delivery_date', end).neq('status', 'annulee');
  return (data as EcoOrder[]) || [];
}

async function fetchRecipes(): Promise<{ recipes: RecipeCostData[]; srs: RecipeCostData[] }> {
  const { data } = await supabase
    .from('recipe_sheets')
    .select(`id, product_reference_id, rendement, perte_pct, type, ingredients:recipe_ingredients!recipe_sheet_id(quantite, stock_item_id, sous_recipe_id, stock_item:stock_items(prix_moyen_pondere, unite, poids_unitaire_g))`);
  const all = (data as RecipeCostData[]) || [];
  return { recipes: all.filter(r => r.type === 'recette'), srs: all.filter(r => r.type === 'sous_recette') };
}

async function fetchCharges(mois: string): Promise<ChargesTotaux> {
  const [{ data: rhData, error: rhError }, { data: pres }, { data: emps }, { data: fix }, { data: enr }, { data: vari }] = await Promise.all([
    supabase.rpc('get_masse_salariale', { p_mois: mois }),
    supabase.from('rh_presences').select('employe_id, jours_travailles, prime').eq('mois', mois),
    supabase.from('rh_employes').select('id, salaire_mensuel').eq('actif', true),
    supabase.from('charges_fixes').select('montant').eq('actif', true),
    supabase.from('charges_energie').select('montant').eq('mois', mois),
    supabase.from('charges_variables').select('montant').eq('mois', mois),
  ]);

  // RH : utilise le RPC si disponible, sinon fallback JS
  let rh = 0;
  const rpcVal = Number((rhData as { rh: number | string }[] | null)?.[0]?.rh ?? 0);
  if (!rhError && rpcVal > 0) {
    rh = rpcVal;
  } else {
    // Fallback JS (même logique que la page RH)
    const empMap = new Map<string, number>();
    ((emps as { id: string; salaire_mensuel: number }[]) || []).forEach(e => empMap.set(e.id, e.salaire_mensuel));
    const presIds = new Set(((pres as { employe_id: string }[]) || []).map(p => p.employe_id));
    rh = ((pres as { employe_id: string; jours_travailles: number; prime: number }[]) || [])
      .reduce((s, p) => s + (empMap.get(p.employe_id) ?? 0) / 26 * (p.jours_travailles || 0) + (p.prime || 0), 0)
      + ((emps as { id: string; salaire_mensuel: number }[]) || []).filter(e => !presIds.has(e.id)).reduce((s, e) => s + e.salaire_mensuel, 0);
  }

  const fixes = ((fix as { montant: number }[]) || []).reduce((s, f) => s + f.montant, 0);
  const energie = ((enr as { montant: number }[]) || []).reduce((s, e) => s + e.montant, 0);
  const variables = ((vari as { montant: number }[]) || []).reduce((s, v) => s + v.montant, 0);
  return { rh, fixes, energie, variables, total: rh + fixes + energie + variables };
}

async function fetchLateCount(): Promise<number> {
  // Via fonction Postgres get_orders_kpis (évite un COUNT séparé)
  const { data } = await supabase.rpc('get_orders_kpis', { p_date: localDate() });
  return Number((data as { late_count: number | string }[] | null)?.[0]?.late_count ?? 0);
}

async function fetchTrend(): Promise<TrendPoint[]> {
  // Via fonction Postgres get_ca_trend (GROUP BY en base)
  const { data } = await supabase.rpc('get_ca_trend', {
    p_start: localDate(-29),
    p_end: localDate(),
  });
  const map = new Map<string, number>();
  for (let i = 0; i < 30; i++) map.set(localDate(-29 + i), 0);
  ((data as { delivery_date: string; ca: number | string }[]) || []).forEach(r =>
    map.set(r.delivery_date, Number(r.ca))
  );
  return Array.from(map.entries()).map(([date, ca]) => ({
    date, ca,
    label: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
  }));
}

// ── Composants ─────────────────────────────────────────────────────────────

function DeltaBadge({ a, b }: { a: number; b: number }) {
  if (b === 0) return <span className="text-xs text-gray-300 flex items-center gap-1"><Minus size={10} />—</span>;
  const pct = Math.round(((a - b) / b) * 100);
  if (pct === 0) return <span className="text-xs text-gray-400 flex items-center gap-1"><Minus size={10} />0%</span>;
  if (pct > 0) return <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><TrendingUp size={11} />+{pct}%</span>;
  return <span className="text-xs text-red-500 font-semibold flex items-center gap-1"><TrendingDown size={11} />{pct}%</span>;
}

// Ligne P&L
function PLRow({ eco, charges, period }: { eco: EcoResult; charges: ChargesTotaux; period: Period }) {
  const hasND = eco.ndRefs.length > 0;
  const isMonthly = period === 'month' || period === 'last_month';
  const resultat = eco.margeBrute - charges.total;
  const pct = (n: number) => eco.ca > 0 ? ` · ${((n / eco.ca) * 100).toFixed(1)}%` : '';

  const cells = [
    { label: 'CA', val: formatPrice(eco.ca), sub: null, color: 'text-gray-900', bg: '' },
    {
      label: 'Coût matière', val: hasND ? 'ND' : formatPrice(eco.coutMatiere),
      sub: hasND ? 'données incomplètes' : `food cost${pct(eco.coutMatiere)}`,
      color: hasND ? 'text-red-400' : 'text-gray-900', bg: hasND ? 'bg-red-50' : '',
    },
    {
      label: 'Marge brute', val: hasND ? 'ND' : formatPrice(eco.margeBrute),
      sub: hasND ? null : pct(eco.margeBrute).slice(3),
      color: hasND ? 'text-red-400' : eco.margeBrute >= 0 ? 'text-green-700' : 'text-red-500', bg: '',
    },
    ...(isMonthly ? [
      { label: 'Charges', val: formatPrice(charges.total), sub: pct(charges.total).slice(3), color: 'text-gray-900', bg: '' },
      {
        label: 'Résultat', val: hasND ? 'ND' : formatPrice(resultat),
        sub: hasND ? null : pct(resultat).slice(3),
        color: hasND ? 'text-red-400' : resultat >= 0 ? 'text-green-700' : 'text-red-500',
        bg: resultat >= 0 ? 'bg-green-50' : 'bg-red-50',
      },
    ] : []),
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
        {cells.map((c, i) => (
          <div key={c.label} className={`p-4 ${c.bg} ${i < cells.length - 1 ? 'border-r border-gray-100' : ''}`}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{c.label}</p>
            <p className={`text-base font-black leading-none ${c.color}`}>{c.val}</p>
            {c.sub && <p className="text-[11px] text-gray-400 mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Alertes
function AlertsBanner({ lateCount, ndRefs, foodCost, cible }: {
  lateCount: number; ndRefs: string[]; foodCost: number | null; cible: number;
}) {
  const [open, setOpen] = useState(false);
  const alerts = [
    lateCount > 0 && { red: true, msg: `${lateCount} commande${lateCount > 1 ? 's' : ''} en retard` },
    ndRefs.length > 0 && { red: false, msg: `${ndRefs.length} référence${ndRefs.length > 1 ? 's' : ''} sans coût`, action: () => setOpen(true) },
    foodCost !== null && foodCost > cible && { red: false, msg: `Food cost ${foodCost.toFixed(1)}% · objectif ${cible}%` },
  ].filter(Boolean) as { red: boolean; msg: string; action?: () => void }[];

  if (!alerts.length) return (
    <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
      <div className="w-2 h-2 bg-green-400 rounded-full" />
      <p className="text-sm font-medium text-green-700">Tout est en ordre</p>
    </div>
  );

  return (
    <>
      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm divide-y divide-gray-100">
        {alerts.map((a, i) => (
          <div key={i} className={`flex items-center justify-between px-4 py-3 ${a.red ? 'bg-red-50' : 'bg-amber-50'}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className={a.red ? 'text-red-500' : 'text-amber-500'} />
              <p className={`text-sm font-medium ${a.red ? 'text-red-700' : 'text-amber-700'}`}>{a.msg}</p>
            </div>
            {a.action && <button onClick={a.action} className="text-xs font-bold text-amber-600 underline underline-offset-2">Voir</button>}
          </div>
        ))}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-xl p-5 max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-900">Références sans coût</p>
              <button onClick={() => setOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {ndRefs.map(n => (
                <div key={n} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0" />
                  <p className="text-sm text-gray-700">{n}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Ops du jour
function TodayOps({ orders }: { orders: DashboardOrder[] }) {
  const nb = orders.length;
  const livrees = orders.filter(o => o.status === 'livree').length;
  const prod = orders.filter(o => o.status === 'production').length;
  const aLivrer = orders.filter(o => ['confirmee', 'prete'].includes(o.status)).length;
  const ca = orders.reduce((s, o) => s + (o.total || 0), 0);
  const tx = nb > 0 ? Math.round((livrees / nb) * 100) : 0;

  const cells = [
    { label: 'Commandes', val: String(nb), color: 'text-gray-900' },
    { label: 'Livrées', val: String(livrees), color: 'text-green-600' },
    { label: 'En production', val: String(prod), color: prod > 0 ? 'text-orange-500' : 'text-gray-400' },
    { label: 'À livrer', val: String(aLivrer), color: aLivrer > 0 ? 'text-blue-600' : 'text-gray-400' },
    { label: 'Taux service', val: `${tx}%`, color: tx === 100 ? 'text-green-600' : tx >= 70 ? 'text-amber-600' : 'text-red-500' },
    { label: 'CA du jour', val: formatPrice(ca), color: 'text-gray-900' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <p className="px-5 py-3 text-sm font-semibold text-gray-800 border-b border-gray-50">Aujourd&apos;hui</p>
      <div className="grid grid-cols-3 sm:grid-cols-6">
        {cells.map((c, i) => (
          <div key={c.label} className={`p-4 text-center ${i < cells.length - 1 ? 'border-r border-gray-50' : ''}`}>
            <p className={`text-xl font-black leading-none ${c.color}`}>{c.val}</p>
            <p className="text-[11px] text-gray-400 mt-1.5 leading-tight">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Graphique CA 30j
function CATrend({ data }: { data: TrendPoint[] }) {
  const total30 = data.reduce((s, d) => s + d.ca, 0);
  const avg = data.length ? total30 / data.length : 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-semibold text-gray-800">CA — 30 derniers jours</p>
        <p className="text-xs text-gray-400">moy. {formatPrice(Math.round(avg))}/j</p>
      </div>
      <p className="text-2xl font-black text-gray-900 mb-4">{formatPrice(total30)}</p>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#d1d5db' }} tickLine={false} axisLine={false} interval={4} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #f3f4f6', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
            formatter={(v) => [formatPrice(Number(v) || 0), 'CA']}
            labelStyle={{ color: '#6b7280', fontWeight: 600 }}
          />
          <Area type="monotone" dataKey="ca" stroke="#3b82f6" strokeWidth={2} fill="url(#grad)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Top clients
function TopClients({ orders }: { orders: DashboardOrder[] }) {
  const map = new Map<string, number>();
  orders.forEach(o => { const n = o.client?.nom ?? 'Inconnu'; map.set(n, (map.get(n) ?? 0) + (o.total || 0)); });
  const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top[0]?.[1] ?? 1;
  const caTotal = orders.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-800 mb-4">Top clients</p>
      {top.length === 0 ? <p className="text-sm text-gray-300 text-center py-6">Aucune commande</p> : (
        <div className="space-y-3.5">
          {top.map(([nom, ca], i) => (
            <div key={nom} className="flex items-center gap-3">
              <span className="w-4 text-xs font-bold text-gray-200 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{nom}</p>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className="text-[11px] text-gray-300">{caTotal > 0 ? `${Math.round((ca / caTotal) * 100)}%` : ''}</span>
                    <span className="text-sm font-bold text-gray-900">{formatPrice(ca)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${Math.round((ca / max) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// CA par atelier
function AtelierRepartition({ orders }: { orders: DashboardOrder[] }) {
  const map = new Map<string, number>();
  orders.forEach(o => o.items?.forEach(item => {
    const a = item.product_article?.product_reference?.atelier || 'Autre';
    map.set(a, (map.get(a) ?? 0) + (item.unit_price || 0) * (item.quantity_ordered || 0));
  }));
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const COLORS: Record<string, string> = { Boulangerie: 'bg-amber-400', Viennoiserie: 'bg-orange-400', 'Pâtisserie': 'bg-pink-400', Chocolaterie: 'bg-rose-500', Traiteur: 'bg-teal-400' };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-800 mb-4">CA par atelier</p>
      {sorted.length === 0 ? <p className="text-sm text-gray-300 text-center py-6">Aucune donnée</p> : (
        <div className="space-y-3">
          {sorted.map(([atelier, ca]) => {
            const pct = total > 0 ? Math.round((ca / total) * 100) : 0;
            return (
              <div key={atelier}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{atelier}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-300">{pct}%</span>
                    <span className="text-sm font-bold text-gray-900 w-20 text-right">{formatPrice(ca)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${COLORS[atelier] ?? 'bg-gray-400'} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Charges breakdown
function ChargesBreakdown({ charges, ca }: { charges: ChargesTotaux; ca: number }) {
  const items = [
    { label: 'RH', val: charges.rh, color: 'bg-blue-500' },
    { label: 'Fixes', val: charges.fixes, color: 'bg-purple-500' },
    { label: 'Énergie', val: charges.energie, color: 'bg-yellow-500' },
    { label: 'Variables', val: charges.variables, color: 'bg-orange-500' },
  ];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-800">Charges du mois</p>
        <p className="text-sm font-black text-gray-900">{formatPrice(charges.total)}</p>
      </div>
      <div className="space-y-3">
        {items.map(item => {
          const pct = charges.total > 0 ? Math.round((item.val / charges.total) * 100) : 0;
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">{item.label}</span>
                <div className="flex items-center gap-2">
                  {ca > 0 && <span className="text-[11px] text-gray-300">{((item.val / ca) * 100).toFixed(1)}% CA</span>}
                  <span className="text-sm font-bold text-gray-900 w-24 text-right">{formatPrice(item.val)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'last_month', label: 'Mois précédent' },
];

export default function DashboardPage() {
  const { can } = usePermissions();
  const showFinancials = can('dashboard.view_financials');

  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [todayOrders, setTodayOrders] = useState<DashboardOrder[]>([]);
  const [eco, setEco] = useState<EcoResult>({ ca: 0, coutMatiere: 0, margeBrute: 0, ndRefs: [] });
  const [charges, setCharges] = useState<ChargesTotaux>({ rh: 0, fixes: 0, energie: 0, variables: 0, total: 0 });
  const [lateCount, setLateCount] = useState(0);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end, mois } = getPeriodDates(period);
    const today = localDate();
    const isToday = period === 'today';

    const [periodOrders, todayData, ecoOrders, { recipes, srs }, chargesData, late, trendData] = await Promise.all([
      fetchOrders(start, end),
      isToday ? Promise.resolve(null) : fetchOrders(today, today),
      fetchEcoOrders(start, end),
      fetchRecipes(),
      fetchCharges(mois),
      fetchLateCount(),
      fetchTrend(),
    ]);

    const costCache = buildCostCache(recipes, srs);
    setOrders(periodOrders);
    setTodayOrders(isToday ? periodOrders : (todayData ?? []));
    setEco(computeEco(ecoOrders, costCache));
    setCharges(chargesData);
    setLateCount(late);
    setTrend(trendData);
    setLastRefresh(new Date());
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // Realtime : toute modif sur orders → refetch du dashboard (throttled 5s)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => load(), 5000);
      })
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [load]);

  const isMonthly = period === 'month' || period === 'last_month';
  const foodCost = eco.ca > 0 ? (eco.coutMatiere / eco.ca) * 100 : null;
  const { label: periodLabel } = getPeriodDates(period);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-none">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">{periodLabel}</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 shadow-sm shrink-0">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {lastRefresh ? lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </button>
      </div>

      {/* Sélecteur de période */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${
              period === p.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-200'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {loading && !orders.length ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* P&L */}
          {showFinancials && <PLRow eco={eco} charges={charges} period={period} />}

          {/* Alertes */}
          {showFinancials && <AlertsBanner lateCount={lateCount} ndRefs={eco.ndRefs} foodCost={foodCost} cible={35} />}

          {/* Ops du jour */}
          <TodayOps orders={todayOrders} />

          {/* Tendance 30j */}
          {showFinancials && <CATrend data={trend} />}

          {/* 2 colonnes */}
          {showFinancials && (
            <div className="grid lg:grid-cols-2 gap-4">
              <TopClients orders={orders} />
              <AtelierRepartition orders={orders} />
            </div>
          )}

          {/* Charges (mensuel seulement) */}
          {showFinancials && isMonthly && <ChargesBreakdown charges={charges} ca={eco.ca} />}

          <p className="text-center text-[11px] text-gray-200 pb-2">
            {lastRefresh ? `Actualisé ${lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''} · hors commandes annulées
          </p>
        </>
      )}
    </div>
  );
}
