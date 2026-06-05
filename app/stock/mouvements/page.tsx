'use client';

import { useEffect, useState, useMemo } from 'react';
import { Search, ArrowDownCircle, ArrowUpCircle, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Mouvement {
  id: string;
  date: string;
  type: string;
  quantite: number;
  prix_unitaire: number | null;
  note: string | null;
  utilisateur: string | null;
  stock_item: { id: string; nom: string; unite: string } | null;
}

// ─── Config types ─────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; sign: '+' | '-' | '±' }> = {
  entree_facture:  { label: 'Entrée fournisseur', color: 'text-green-700',  bg: 'bg-green-50',   sign: '+' },
  sortie_economat: { label: 'Sortie économat',    color: 'text-orange-700', bg: 'bg-orange-50',  sign: '-' },
  inventaire:      { label: 'Correction inventaire', color: 'text-blue-700', bg: 'bg-blue-50',   sign: '±' },
  perte:           { label: 'Perte / Casse',      color: 'text-red-700',    bg: 'bg-red-50',     sign: '-' },
  transfert:       { label: 'Transfert',           color: 'text-purple-700', bg: 'bg-purple-50',  sign: '±' },
  production:      { label: 'Production',          color: 'text-indigo-700', bg: 'bg-indigo-50',  sign: '-' },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type, color: 'text-gray-700', bg: 'bg-gray-100', sign: '±' as const };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TYPES_FILTER = [
  { value: '', label: 'Tous les types' },
  { value: 'entree_facture',  label: 'Entrées fournisseur' },
  { value: 'sortie_economat', label: 'Sorties économat' },
  { value: 'inventaire',      label: 'Corrections inventaire' },
  { value: 'perte',           label: 'Pertes / Casse' },
  { value: 'transfert',       label: 'Transferts' },
  { value: 'production',      label: 'Production' },
];

const PERIODES = [
  { value: 7,   label: '7 jours' },
  { value: 30,  label: '30 jours' },
  { value: 90,  label: '3 mois' },
  { value: 365, label: '1 an' },
];

export default function MouvementsPage() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');
  const [periode, setPeriode]       = useState(30);

  useEffect(() => { load(); }, [periode]);

  async function load() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - periode);

    const { data } = await supabase
      .from('stock_movements')
      .select('id, date, type, quantite, prix_unitaire, note, utilisateur, stock_item:stock_items(id, nom, unite)')
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    setMouvements((data as Mouvement[]) || []);
    setLoading(false);
  }

  const displayed = useMemo(() => mouvements.filter(m => {
    const matchType   = !filterType || m.type === filterType;
    const matchSearch = !search || (m.stock_item?.nom ?? '').toLowerCase().includes(search.toLowerCase())
      || (m.note ?? '').toLowerCase().includes(search.toLowerCase())
      || (m.utilisateur ?? '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  }), [mouvements, filterType, search]);

  const totalEntrees = displayed.filter(m => m.quantite > 0).reduce((s, m) => s + m.quantite, 0);
  const totalSorties = displayed.filter(m => m.quantite < 0).reduce((s, m) => s + Math.abs(m.quantite), 0);
  const totalPertes  = displayed.filter(m => m.type === 'perte').reduce((s, m) => s + Math.abs(m.quantite), 0);

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function fmtQte(m: Mouvement) {
    const sign = m.quantite > 0 ? '+' : '';
    return `${sign}${m.quantite} ${m.stock_item?.unite ?? ''}`;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mouvements de stock</h1>
          <p className="text-sm text-gray-400">{displayed.length} mouvement{displayed.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {PERIODES.map(p => (
            <button key={p.value} onClick={() => setPeriode(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${periode === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-lg font-black text-green-600">+{totalEntrees.toFixed(1)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Entrées</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-lg font-black text-orange-500">-{totalSorties.toFixed(1)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Sorties</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-lg font-black text-red-500">-{totalPertes.toFixed(1)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Pertes</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Article, note, utilisateur…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          {TYPES_FILTER.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <RefreshCw className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun mouvement sur la période</p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Article</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-right px-4 py-3">Quantité</th>
                    <th className="text-right px-4 py-3 hidden lg:table-cell">P.U.</th>
                    <th className="text-left px-4 py-3">Note</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Utilisateur</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(m => (
                    <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(m.date)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{m.stock_item?.nom ?? '—'}</td>
                      <td className="px-4 py-2.5"><TypeBadge type={m.type} /></td>
                      <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${m.quantite > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtQte(m)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400 text-xs hidden lg:table-cell">
                        {m.prix_unitaire ? `${m.prix_unitaire.toFixed(2)} MAD` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[200px] truncate">{m.note ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs hidden lg:table-cell">{m.utilisateur ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {displayed.map(m => (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{m.stock_item?.nom ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(m.date)}{m.utilisateur ? ` · ${m.utilisateur}` : ''}</p>
                  </div>
                  <span className={`font-bold text-sm tabular-nums whitespace-nowrap ${m.quantite > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmtQte(m)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <TypeBadge type={m.type} />
                  {m.note && <span className="text-xs text-gray-400 truncate">{m.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
