'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, ShoppingCart, Receipt,
  Building2, Package, AlertTriangle, ArrowUpRight, BarChart3,
  Calendar, Search, History,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  date_facture: string;
  statut: 'brouillon' | 'validee';
  total: number;
  supplier_id: string;
  supplier?: { nom: string } | null;
  lines?: InvoiceLine[];
}

interface InvoiceLine {
  stock_item_id: string;
  quantite: number;
  prix_unitaire: number;
  stock_item?: { nom: string; unite: string } | null;
}

interface BDC {
  id: string;
  date: string;
  statut: string;
  total: number;
  supplier_id: string;
  supplier?: { nom: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '1 mois',  days: 30 },
  { label: '3 mois',  days: 90 },
  { label: '6 mois',  days: 180 },
  { label: '1 an',    days: 365 },
];

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' MAD';
}

function fmtPct(n: number, plus = false) {
  const s = n.toFixed(1) + '%';
  return plus && n > 0 ? '+' + s : s;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

interface HistRow {
  id: string;
  nom: string;
  unite: string;
  fournisseurs: string[];
  dernierPrix: number;
  dernierFournisseur: string;
  dernierDate: string;
  historique: { date: string; prix: number; fournisseur: string; quantite: number }[];
}

function monthKey(d: string) {
  return d.slice(0, 7); // "2025-03"
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(+y, +m - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

// ─── Composant mini bar ────────────────────────────────────────────────────────

function Bar({ pct, color = 'bg-indigo-500' }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysesAchatPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bons, setBons]         = useState<BDC[]>([]);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState(90);
  const [tab, setTab]           = useState<'depenses' | 'articles' | 'prix' | 'historique'>('depenses');
  const [histSearch, setHistSearch] = useState('');
  const [expandedHistId, setExpandedHistId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from('supplier_invoices')
        .select('*, supplier:suppliers(nom), lines:supplier_invoice_lines(*, stock_item:stock_items(nom, unite))')
        .order('date_facture', { ascending: false }),
      supabase
        .from('purchase_orders')
        .select('id, date, statut, total, supplier_id, supplier:suppliers(nom)')
        .order('date', { ascending: false }),
    ]).then(([{ data: inv }, { data: bc }]) => {
      setInvoices((inv as Invoice[]) || []);
      setBons((bc as BDC[]) || []);
      setLoading(false);
    });
  }, []);

  // ── Filtre période ──────────────────────────────────────────────────────────
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - period);
    return d.toISOString().slice(0, 10);
  }, [period]);

  // Période précédente (même durée, avant cutoff)
  const cutoffPrev = useMemo(() => {
    const d = new Date(cutoff);
    d.setDate(d.getDate() - period);
    return d.toISOString().slice(0, 10);
  }, [cutoff, period]);

  const validatedInPeriod = useMemo(() =>
    invoices.filter(i => i.statut === 'validee' && i.date_facture >= cutoff),
    [invoices, cutoff]
  );

  const validatedPrevPeriod = useMemo(() =>
    invoices.filter(i => i.statut === 'validee' && i.date_facture >= cutoffPrev && i.date_facture < cutoff),
    [invoices, cutoff, cutoffPrev]
  );

  const bonsInPeriod = useMemo(() =>
    bons.filter(b => b.date >= cutoff),
    [bons, cutoff]
  );

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalActuel = validatedInPeriod.reduce((s, i) => s + (i.total ?? 0), 0);
    const totalPrev   = validatedPrevPeriod.reduce((s, i) => s + (i.total ?? 0), 0);
    const nbFactures  = validatedInPeriod.length;
    const suppliersActifs = new Set(validatedInPeriod.map(i => i.supplier_id)).size;
    const nbBons = bonsInPeriod.length;
    const tauxConversion = nbBons > 0 ? (nbFactures / nbBons) * 100 : 0;
    const evol = totalPrev > 0 ? ((totalActuel - totalPrev) / totalPrev) * 100 : null;

    return { totalActuel, totalPrev, nbFactures, suppliersActifs, nbBons, tauxConversion, evol };
  }, [validatedInPeriod, validatedPrevPeriod, bonsInPeriod]);

  // ── Dépenses par mois ────────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    validatedInPeriod.forEach(i => {
      const k = monthKey(i.date_facture);
      map[k] = (map[k] ?? 0) + (i.total ?? 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [validatedInPeriod]);

  const maxMonthly = useMemo(() =>
    Math.max(...monthlyData.map(([, v]) => v), 1),
    [monthlyData]
  );

  // ── Répartition par fournisseur ──────────────────────────────────────────────
  const bySupplier = useMemo(() => {
    const map: Record<string, { nom: string; total: number; nb: number }> = {};
    validatedInPeriod.forEach(i => {
      const nom = i.supplier?.nom ?? 'Inconnu';
      if (!map[i.supplier_id]) map[i.supplier_id] = { nom, total: 0, nb: 0 };
      map[i.supplier_id].total += i.total ?? 0;
      map[i.supplier_id].nb++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [validatedInPeriod]);

  const maxSupplier = useMemo(() =>
    Math.max(...bySupplier.map(s => s.total), 1),
    [bySupplier]
  );

  // ── Top articles par valeur ──────────────────────────────────────────────────
  const topArticles = useMemo(() => {
    const map: Record<string, { nom: string; unite: string; total: number; qte: number; nbAchats: number }> = {};
    validatedInPeriod.forEach(inv => {
      (inv.lines || []).forEach(line => {
        const id = line.stock_item_id;
        if (!map[id]) map[id] = {
          nom: line.stock_item?.nom ?? '—',
          unite: line.stock_item?.unite ?? '',
          total: 0, qte: 0, nbAchats: 0,
        };
        map[id].total += line.quantite * line.prix_unitaire;
        map[id].qte   += line.quantite;
        map[id].nbAchats++;
      });
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [validatedInPeriod]);

  const maxArticle = useMemo(() =>
    Math.max(...topArticles.map(a => a.total), 1),
    [topArticles]
  );

  // ── Alertes prix (hausse > 5% vs période précédente) ────────────────────────
  const priceAlerts = useMemo(() => {
    // Dernier prix de chaque article sur la période actuelle
    const current: Record<string, { nom: string; prix: number; date: string; fournisseur: string }> = {};
    validatedInPeriod.forEach(inv => {
      (inv.lines || []).forEach(line => {
        const id = line.stock_item_id;
        const existing = current[id];
        if (!existing || inv.date_facture > existing.date) {
          current[id] = {
            nom: line.stock_item?.nom ?? '—',
            prix: line.prix_unitaire,
            date: inv.date_facture,
            fournisseur: inv.supplier?.nom ?? '—',
          };
        }
      });
    });

    // Dernier prix de chaque article sur la période précédente
    const prev: Record<string, number> = {};
    validatedPrevPeriod.forEach(inv => {
      (inv.lines || []).forEach(line => {
        const id = line.stock_item_id;
        const existing = prev[id];
        if (!existing) prev[id] = line.prix_unitaire;
        // on garde le plus récent de la période précédente
      });
    });

    const alerts = Object.entries(current)
      .filter(([id]) => prev[id] !== undefined)
      .map(([id, cur]) => {
        const pct = ((cur.prix - prev[id]) / prev[id]) * 100;
        return { id, ...cur, prixPrev: prev[id], pct };
      })
      .filter(a => Math.abs(a.pct) >= 3)
      .sort((a, b) => b.pct - a.pct);

    return alerts;
  }, [validatedInPeriod, validatedPrevPeriod]);

  // ── Historique complet des achats (toutes périodes) ─────────────────────────
  const histRows = useMemo((): HistRow[] => {
    const allValidated = invoices.filter(i => i.statut === 'validee');
    const map: Record<string, HistRow> = {};
    for (const inv of allValidated) {
      for (const line of (inv.lines || [])) {
        const id  = line.stock_item_id;
        const nom = line.stock_item?.nom ?? '—';
        const unite = line.stock_item?.unite ?? '';
        const fournisseur = inv.supplier?.nom ?? '—';
        const date = inv.date_facture;
        if (!map[id]) map[id] = { id, nom, unite, fournisseurs: [], dernierPrix: 0, dernierFournisseur: '', dernierDate: '', historique: [] };
        map[id].historique.push({ date, prix: line.prix_unitaire, fournisseur, quantite: line.quantite });
        if (!map[id].fournisseurs.includes(fournisseur)) map[id].fournisseurs.push(fournisseur);
      }
    }
    for (const row of Object.values(map)) {
      row.historique.sort((a, b) => b.date.localeCompare(a.date));
      const last = row.historique[0];
      if (last) { row.dernierPrix = last.prix; row.dernierFournisseur = last.fournisseur; row.dernierDate = last.date; }
    }
    return Object.values(map)
      .filter(r => r.nom !== '—' && (!histSearch || r.nom.toLowerCase().includes(histSearch.toLowerCase())))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [invoices, histSearch]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header + période */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Analyses achats</h2>
          <p className="text-sm text-gray-500 mt-0.5">Suivi des dépenses, fournisseurs et évolutions de prix</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === p.days
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total dépensé */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Receipt size={18} className="text-indigo-600" />
            </div>
            {kpis.evol !== null && (
              kpis.evol > 0
                ? <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500"><TrendingUp size={12} />{fmtPct(kpis.evol, true)}</span>
                : kpis.evol < 0
                  ? <span className="flex items-center gap-0.5 text-xs font-semibold text-green-600"><TrendingDown size={12} />{fmtPct(kpis.evol)}</span>
                  : <Minus size={14} className="text-gray-400" />
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900 leading-none">{fmt(kpis.totalActuel)}</p>
          <p className="text-xs text-gray-500 mt-1">Total dépensé</p>
          {kpis.totalPrev > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Période préc. : {fmt(kpis.totalPrev)}</p>
          )}
        </div>

        {/* Factures */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <Receipt size={18} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 leading-none">{kpis.nbFactures}</p>
          <p className="text-xs text-gray-500 mt-1">Factures validées</p>
          {kpis.nbFactures > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Moy. {fmt(kpis.totalActuel / kpis.nbFactures)} / facture</p>
          )}
        </div>

        {/* Fournisseurs actifs */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center mb-3">
            <Building2 size={18} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 leading-none">{kpis.suppliersActifs}</p>
          <p className="text-xs text-gray-500 mt-1">Fournisseurs actifs</p>
        </div>

        {/* Bons de commande */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center mb-3">
            <ShoppingCart size={18} className="text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 leading-none">{kpis.nbBons}</p>
          <p className="text-xs text-gray-500 mt-1">Bons de commande</p>
          {kpis.tauxConversion > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{kpis.tauxConversion.toFixed(0)}% convertis</p>
          )}
        </div>
      </div>

      {/* Onglets analyse */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'depenses',   label: 'Dépenses & fournisseurs', icon: BarChart3 },
            { key: 'articles',   label: 'Top articles',            icon: Package },
            { key: 'prix',       label: 'Évolution des prix',      icon: TrendingUp },
            { key: 'historique', label: 'Historique des achats',   icon: History },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === key
                  ? 'text-indigo-600 border-indigo-600'
                  : 'text-gray-500 border-transparent hover:text-gray-800'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ── Tab dépenses ── */}
          {tab === 'depenses' && (
            <div className="space-y-8">

              {/* Dépenses par mois */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Calendar size={14} className="text-gray-400" />
                  Dépenses mensuelles
                </h3>
                {monthlyData.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucune donnée sur cette période.</p>
                ) : (
                  <div className="space-y-3">
                    {monthlyData.map(([key, value]) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-14 shrink-0">{monthLabel(key)}</span>
                        <div className="flex-1">
                          <Bar pct={(value / maxMonthly) * 100} color="bg-indigo-500" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 w-32 text-right shrink-0">{fmt(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Répartition fournisseurs */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Building2 size={14} className="text-gray-400" />
                  Répartition par fournisseur
                </h3>
                {bySupplier.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun fournisseur sur cette période.</p>
                ) : (
                  <div className="space-y-3">
                    {bySupplier.map((s, i) => {
                      const pct = (s.total / kpis.totalActuel) * 100;
                      const COLORS = ['bg-indigo-500','bg-violet-500','bg-blue-500','bg-cyan-500','bg-teal-500','bg-emerald-500'];
                      const color = COLORS[i % COLORS.length];
                      return (
                        <div key={s.nom} className="flex items-center gap-3">
                          <span className="text-xs text-gray-700 font-medium w-36 truncate shrink-0">{s.nom}</span>
                          <div className="flex-1">
                            <Bar pct={(s.total / maxSupplier) * 100} color={color} />
                          </div>
                          <div className="text-right shrink-0 w-36">
                            <span className="text-sm font-semibold text-gray-900">{fmt(s.total)}</span>
                            <span className="text-xs text-gray-400 ml-2">{pct.toFixed(0)}%</span>
                          </div>
                          <span className="text-xs text-gray-400 w-16 text-right shrink-0">{s.nb} fact.</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab articles ── */}
          {tab === 'articles' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Package size={14} className="text-gray-400" />
                Top articles par valeur d&apos;achat
              </h3>
              {topArticles.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun article sur cette période.</p>
              ) : (
                <div className="space-y-3">
                  {topArticles.map((a, i) => (
                    <div key={a.nom + i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-mono w-5 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate">{a.nom}</span>
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <span className="text-xs text-gray-400">{a.qte.toLocaleString('fr-FR')} {a.unite}</span>
                            <span className="text-xs text-gray-400">{a.nbAchats} achat{a.nbAchats > 1 ? 's' : ''}</span>
                            <span className="text-sm font-semibold text-gray-900 w-28 text-right">{fmt(a.total)}</span>
                          </div>
                        </div>
                        <Bar pct={(a.total / maxArticle) * 100} color="bg-violet-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab prix ── */}
          {tab === 'prix' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <TrendingUp size={14} className="text-gray-400" />
                  Variations de prix vs période précédente
                </h3>
                {priceAlerts.filter(a => a.pct > 0).length > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-600">
                    <AlertTriangle size={11} />
                    {priceAlerts.filter(a => a.pct > 0).length} hausse{priceAlerts.filter(a => a.pct > 0).length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {priceAlerts.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <TrendingDown size={22} className="text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Prix stables</p>
                  <p className="text-xs text-gray-400 mt-1">Aucune variation significative (&gt;3%) détectée</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Article</th>
                        <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fournisseur</th>
                        <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prix préc.</th>
                        <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prix actuel</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Variation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {priceAlerts.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4 font-medium text-gray-900">{a.nom}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{a.fournisseur}</td>
                          <td className="py-2.5 pr-4 text-right text-gray-500">
                            {a.prixPrev.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">
                            {a.prix.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 text-right">
                            {a.pct > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-bold">
                                <ArrowUpRight size={11} />
                                +{a.pct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-xs font-bold">
                                <TrendingDown size={11} />
                                {a.pct.toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab historique ── */}
          {tab === 'historique' && (
            <div className="space-y-4">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={histSearch} onChange={e => setHistSearch(e.target.value)}
                  placeholder="Rechercher un article…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {histRows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Aucun achat enregistré.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Article</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fournisseur(s)</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dernier prix</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dernier achat</th>
                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Achats</th>
                        <th className="px-4 py-2.5 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {histRows.map(row => {
                        const open = expandedHistId === row.id;
                        return (
                          <>
                            <tr key={row.id}
                              onClick={() => setExpandedHistId(open ? null : row.id)}
                              className="hover:bg-gray-50/50 transition-colors cursor-pointer group">
                              <td className="px-5 py-3">
                                <p className="font-semibold text-gray-900">{row.nom}</p>
                                <p className="text-xs text-gray-400">{row.unite}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {row.fournisseurs.slice(0, 2).map(f => (
                                    <span key={f} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-md">{f}</span>
                                  ))}
                                  {row.fournisseurs.length > 2 && (
                                    <span className="text-xs text-gray-400">+{row.fournisseurs.length - 2}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-gray-900 tabular-nums">{row.dernierPrix.toFixed(2)}</span>
                                <span className="text-xs text-gray-400 ml-1">MAD/{row.unite}</span>
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-gray-400 tabular-nums">
                                {row.dernierDate ? fmtDate(row.dernierDate) : '—'}
                              </td>
                              <td className="px-4 py-3 text-center text-gray-500 tabular-nums">
                                {row.historique.length}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-gray-300 group-hover:text-gray-500 transition-colors text-xs">
                                  {open ? '▲' : '▼'}
                                </span>
                              </td>
                            </tr>
                            {open && (
                              <tr key={`${row.id}-hist`}>
                                <td colSpan={6} className="px-5 pb-4 pt-0 bg-gray-50/30">
                                  <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Historique complet — {row.nom}</p>
                                    </div>
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-gray-50">
                                          <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Date</th>
                                          <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Fournisseur</th>
                                          <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase">Quantité</th>
                                          <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase">Prix unitaire</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {row.historique.map((h, i) => (
                                          <tr key={i} className={i === 0 ? 'bg-indigo-50/40' : ''}>
                                            <td className="px-4 py-2 text-gray-600 tabular-nums">{fmtDate(h.date)}</td>
                                            <td className="px-4 py-2 text-gray-600">{h.fournisseur}</td>
                                            <td className="px-4 py-2 text-right text-gray-600 tabular-nums">{h.quantite} {row.unite}</td>
                                            <td className="px-4 py-2 text-right font-semibold tabular-nums">
                                              <span className={i === 0 ? 'text-indigo-700' : 'text-gray-900'}>
                                                {h.prix.toFixed(2)} MAD
                                              </span>
                                              {i > 0 && row.historique[i - 1] && (() => {
                                                const prev = row.historique[i - 1].prix;
                                                const pct = prev > 0 ? Math.abs((h.prix - prev) / prev) * 100 : 0;
                                                if (pct > 300) return null;
                                                return (
                                                  <span className={`ml-1.5 text-xs ${h.prix > prev ? 'text-red-400' : h.prix < prev ? 'text-green-500' : 'text-gray-300'}`}>
                                                    {h.prix > prev ? '↑' : h.prix < prev ? '↓' : ''}
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
