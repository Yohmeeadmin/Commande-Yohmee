'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, X, Trash2, AlertTriangle, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockItem { id: string; nom: string; unite: string; stock_actuel: number; }

interface Perte {
  id: string;
  date: string;
  quantite: number;
  note: string | null;
  utilisateur: string | null;
  stock_item: { nom: string; unite: string } | null;
}

// ─── Motifs ──────────────────────────────────────────────────────────────────

const MOTIFS = ['Cassé', 'Périmé', 'Brûlé', 'Test R&D', 'Don', 'Autre'];

const MOTIF_COLOR: Record<string, string> = {
  'Cassé':    'bg-gray-100 text-gray-700',
  'Périmé':   'bg-orange-100 text-orange-700',
  'Brûlé':    'bg-red-100 text-red-700',
  'Test R&D': 'bg-blue-100 text-blue-700',
  'Don':      'bg-green-100 text-green-700',
  'Autre':    'bg-purple-100 text-purple-700',
};

function MotifBadge({ note }: { note: string | null }) {
  if (!note) return <span className="text-xs text-gray-300">—</span>;
  const motif = MOTIFS.find(m => note.startsWith(m)) ?? note;
  const cls = MOTIF_COLOR[motif] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{note}</span>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PertesPage() {
  const { profile } = useUser();
  const [pertes, setPertes]         = useState<Perte[]>([]);
  const [items, setItems]           = useState<StockItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [filterMotif, setFilterMotif] = useState('');

  // Formulaire
  const [fItemId, setFItemId]   = useState('');
  const [fQte, setFQte]         = useState('');
  const [fMotif, setFMotif]     = useState(MOTIFS[0]);
  const [fNote, setFNote]       = useState('');
  const [fDate, setFDate]       = useState(() => new Date().toISOString().split('T')[0]);
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: p }, { data: it }] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('id, date, quantite, note, utilisateur, stock_item:stock_items(nom, unite)')
        .eq('type', 'perte')
        .order('date', { ascending: false })
        .order('id', { ascending: false }),
      supabase.from('stock_items').select('id, nom, unite, stock_actuel').order('nom'),
    ]);
    setPertes((p as Perte[]) || []);
    setItems((it as StockItem[]) || []);
    setLoading(false);
  }

  async function declarer() {
    if (!fItemId || !fQte || parseFloat(fQte) <= 0) return;
    setSaving(true);

    const item = items.find(i => i.id === fItemId);
    const qte  = parseFloat(fQte);
    const note = fNote.trim() ? `${fMotif} — ${fNote.trim()}` : fMotif;
    const utilisateur = profile ? `${profile.first_name} ${profile.last_name}` : null;

    await Promise.all([
      supabase.from('stock_items').update({
        stock_actuel: Math.max(0, (item?.stock_actuel ?? 0) - qte),
      }).eq('id', fItemId),
      supabase.from('stock_movements').insert({
        stock_item_id: fItemId,
        type: 'perte',
        quantite: -qte,
        date: fDate,
        note,
        utilisateur,
      }),
    ]);

    setFItemId(''); setFQte(''); setFMotif(MOTIFS[0]); setFNote('');
    setFDate(new Date().toISOString().split('T')[0]);
    setItemSearch('');
    setShowForm(false);
    setSaving(false);
    await load();
  }

  async function supprimer(perte: Perte) {
    if (!confirm(`Supprimer cette perte ? Le stock ne sera PAS recrédité.`)) return;
    await supabase.from('stock_movements').delete().eq('id', perte.id);
    setPertes(prev => prev.filter(p => p.id !== perte.id));
  }

  const displayed = useMemo(() => pertes.filter(p => {
    const matchSearch = !search
      || (p.stock_item?.nom ?? '').toLowerCase().includes(search.toLowerCase())
      || (p.utilisateur ?? '').toLowerCase().includes(search.toLowerCase());
    const matchMotif = !filterMotif || (p.note ?? '').startsWith(filterMotif);
    return matchSearch && matchMotif;
  }), [pertes, search, filterMotif]);

  const totalUnites = displayed.reduce((s, p) => s + Math.abs(p.quantite), 0);
  const filteredItems = items.filter(i => i.nom.toLowerCase().includes(itemSearch.toLowerCase()));
  const selectedItem  = items.find(i => i.id === fItemId);

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pertes & Casse</h1>
          <p className="text-sm text-gray-400">{displayed.length} enregistrement{displayed.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${showForm ? 'bg-gray-200 text-gray-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Annuler' : 'Déclarer une perte'}
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle size={15} /> Déclaration de perte — le stock sera déduit immédiatement
          </p>

          {/* Sélection article */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-600 font-medium">Article *</label>
            {fItemId ? (
              <div className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-xl">
                <div>
                  <span className="font-medium text-gray-900">{selectedItem?.nom}</span>
                  <span className="text-xs text-gray-400 ml-2">Stock actuel : {selectedItem?.stock_actuel} {selectedItem?.unite}</span>
                </div>
                <button onClick={() => { setFItemId(''); setItemSearch(''); }} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                  placeholder="Rechercher un article…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
                {itemSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    {filteredItems.slice(0, 20).map(i => (
                      <button key={i.id} onClick={() => { setFItemId(i.id); setItemSearch(''); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between">
                        <span className="font-medium">{i.nom}</span>
                        <span className="text-xs text-gray-400">{i.stock_actuel} {i.unite}</span>
                      </button>
                    ))}
                    {filteredItems.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Aucun résultat</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Quantité */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">Quantité *{selectedItem ? ` (${selectedItem.unite})` : ''}</span>
              <input type="number" min={0.001} step={0.001} value={fQte} onChange={e => setFQte(e.target.value)}
                placeholder="0"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
            </label>

            {/* Motif */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">Motif *</span>
              <select value={fMotif} onChange={e => setFMotif(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
                {MOTIFS.map(m => <option key={m}>{m}</option>)}
              </select>
            </label>

            {/* Date */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">Date</span>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
            </label>
          </div>

          {/* Note libre */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600 font-medium">Note (optionnel)</span>
            <input value={fNote} onChange={e => setFNote(e.target.value)}
              placeholder="Ex : plateau tombé, frigo en panne…"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
          </label>

          <button onClick={declarer} disabled={saving || !fItemId || !fQte}
            className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors">
            {saving ? 'Enregistrement…' : 'Confirmer la perte'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {MOTIFS.slice(0, 4).map(motif => {
          const count = pertes.filter(p => (p.note ?? '').startsWith(motif)).length;
          return (
            <button key={motif} onClick={() => setFilterMotif(filterMotif === motif ? '' : motif)}
              className={`text-left rounded-2xl border px-4 py-3 transition-colors ${filterMotif === motif ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-white'}`}>
              <p className={`text-xl font-black ${filterMotif === motif ? 'text-red-600' : 'text-gray-900'}`}>{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{motif}</p>
            </button>
          );
        })}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Article ou utilisateur…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <button onClick={() => setFilterMotif('')}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${!filterMotif ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Tous
        </button>
        {MOTIFS.map(m => (
          <button key={m} onClick={() => setFilterMotif(filterMotif === m ? '' : m)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${filterMotif === m ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {m}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <AlertTriangle className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucune perte enregistrée</p>
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
                    <th className="text-right px-4 py-3">Quantité</th>
                    <th className="text-left px-4 py-3">Motif</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Utilisateur</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(p => (
                    <tr key={p.id} className="border-t border-gray-50 hover:bg-red-50/30 transition-colors">
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.date)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{p.stock_item?.nom ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums">
                        -{Math.abs(p.quantite)} {p.stock_item?.unite}
                      </td>
                      <td className="px-4 py-2.5"><MotifBadge note={p.note} /></td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs hidden lg:table-cell">{p.utilisateur ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => supprimer(p)} className="p-1 text-gray-300 hover:text-red-500 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr className="text-xs text-gray-500 font-semibold">
                    <td colSpan={2} className="px-4 py-2.5">Total ({displayed.length})</td>
                    <td className="px-4 py-2.5 text-right text-red-600">-{totalUnites.toFixed(2)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {displayed.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-red-100 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{p.stock_item?.nom ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(p.date)}{p.utilisateur ? ` · ${p.utilisateur}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-red-600 text-sm">-{Math.abs(p.quantite)} {p.stock_item?.unite}</span>
                    <button onClick={() => supprimer(p)} className="p-1 text-gray-300 hover:text-red-500 rounded-lg">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5">
                  <MotifBadge note={p.note} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
