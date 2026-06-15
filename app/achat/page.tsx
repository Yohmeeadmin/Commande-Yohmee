'use client';

import { useEffect, useState, useMemo } from 'react';
import { Search, TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvoiceLine {
  stock_item_id: string;
  quantite: number;
  prix_unitaire: number;
  invoice?: {
    date_facture: string;
    statut: string;
    supplier?: { nom: string } | null;
  } | null;
  stock_item?: { nom: string; unite: string } | null;
}

interface ArticleRow {
  id: string;
  nom: string;
  unite: string;
  fournisseurs: string[];
  dernierPrix: number;
  dernierFournisseur: string;
  dernierDate: string;
  moyennePeriode: number;
  nbAchats: number;
  historique: { date: string; prix: number; fournisseur: string; quantite: number }[];
}

const PERIODS = [
  { label: '1 mois',   days: 30 },
  { label: '3 mois',   days: 90 },
  { label: '6 mois',   days: 180 },
  { label: '1 an',     days: 365 },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Trend({ current, previous }: { current: number; previous: number }) {
  if (!previous || previous === current) return <Minus size={14} className="text-gray-400" />;
  const pct = ((current - previous) / previous) * 100;
  // Ignorer les variations aberrantes (erreur de saisie probable)
  if (Math.abs(pct) > 300) return <Minus size={14} className="text-gray-400" />;
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold">
      <TrendingUp size={13} /> +{pct.toFixed(1)}%
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-green-600 text-xs font-semibold">
      <TrendingDown size={13} /> {pct.toFixed(1)}%
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MercurialePage() {
  const [lines, setLines]       = useState<InvoiceLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [period, setPeriod]     = useState(90);
  const [filterSupplier, setFilterSupplier] = useState('');

  useEffect(() => {
    supabase
      .from('supplier_invoice_lines')
      .select('*, stock_item:stock_items(nom, unite), invoice:supplier_invoices(date_facture, statut, supplier:suppliers(nom))')
      .then(({ data }) => {
        const validated = ((data || []) as InvoiceLine[]).filter(l => l.invoice?.statut === 'validee');
        setLines(validated);
        setLoading(false);
      });
  }, []);

  // ── Construction de la mercuriale ─────────────────────────────────────────

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - period);
    return d.toISOString().slice(0, 10);
  }, [period]);

  const rows = useMemo((): ArticleRow[] => {
    const map: Record<string, ArticleRow> = {};

    for (const l of lines) {
      const id  = l.stock_item_id;
      const nom = l.stock_item?.nom ?? '—';
      const unite = l.stock_item?.unite ?? '';
      const fournisseur = l.invoice?.supplier?.nom ?? '—';
      const date = l.invoice?.date_facture ?? '';

      if (!map[id]) {
        map[id] = { id, nom, unite, fournisseurs: [], dernierPrix: 0, dernierFournisseur: '', dernierDate: '', moyennePeriode: 0, nbAchats: 0, historique: [] };
      }
      map[id].historique.push({ date, prix: l.prix_unitaire, fournisseur, quantite: l.quantite });
      if (!map[id].fournisseurs.includes(fournisseur)) map[id].fournisseurs.push(fournisseur);
    }

    for (const row of Object.values(map)) {
      // Trier historique du plus récent au plus ancien
      row.historique.sort((a, b) => b.date.localeCompare(a.date));

      // Dernier achat
      const last = row.historique[0];
      if (last) { row.dernierPrix = last.prix; row.dernierFournisseur = last.fournisseur; row.dernierDate = last.date; }

      // Moyenne sur la période
      const inPeriod = row.historique.filter(h => h.date >= cutoff);
      row.nbAchats = inPeriod.length;
      row.moyennePeriode = inPeriod.length
        ? inPeriod.reduce((s, h) => s + h.prix, 0) / inPeriod.length
        : 0;
    }

    return Object.values(map)
      .filter(r => r.nom !== '—')
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [lines, cutoff]);

  const suppliers = useMemo(() =>
    Array.from(new Set(rows.flatMap(r => r.fournisseurs))).sort(),
    [rows]
  );

  const displayed = useMemo(() => {
    return rows.filter(r => {
      if (search && !r.nom.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterSupplier && !r.fournisseurs.includes(filterSupplier)) return false;
      return true;
    });
  }, [rows, search, filterSupplier]);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Mercuriale</h2>
        <p className="text-sm text-gray-400">{rows.length} articles · historique des prix d'achat</p>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Période */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Recherche */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* Filtre fournisseur */}
        {suppliers.length > 0 && (
          <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Tous les fournisseurs</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400">Aucun historique d'achat sur cette période</p>
          <p className="text-xs text-gray-300 mt-1">Validez des factures fournisseurs pour alimenter la mercuriale</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">{displayed.length} article{displayed.length > 1 ? 's' : ''}</p>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Calendar size={12} />
              Période : {PERIODS.find(p => p.days === period)?.label}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Article</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fournisseur(s)</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dernier prix</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Moy. période</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tendance</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Achats</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dernier achat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map(row => {
                  const prevPrice = row.historique[1]?.prix ?? 0;
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
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
                      <td className="px-4 py-3 text-right">
                        {row.moyennePeriode > 0 ? (
                          <span className="text-gray-600 tabular-nums">{row.moyennePeriode.toFixed(2)} MAD</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <Trend current={row.dernierPrix} previous={prevPrice} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 tabular-nums">
                        {row.nbAchats > 0 ? row.nbAchats : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400 tabular-nums">
                        {row.dernierDate ? fmtDate(row.dernierDate) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-gray-50">
            {displayed.map(row => {
              const prevPrice = row.historique[1]?.prix ?? 0;
              return (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{row.nom}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{row.dernierFournisseur} · {row.dernierDate ? fmtDate(row.dernierDate) : '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900 tabular-nums">{row.dernierPrix.toFixed(2)} MAD</p>
                      <div className="flex justify-end mt-0.5">
                        <Trend current={row.dernierPrix} previous={prevPrice} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
