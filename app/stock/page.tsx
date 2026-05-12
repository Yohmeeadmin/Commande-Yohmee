'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Package, Search, LayoutList, Table2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

interface StockItem {
  id: string;
  nom: string;
  unite: string;
  stock_actuel: number;
  stock_min: number;
  prix_moyen_pondere: number;
  categorie: string | null;
  conditionnement: string | null;
  supplier: { nom: string } | null;
}

function StockBadge({ actuel, min }: { actuel: number; min: number }) {
  if (actuel <= 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rupture</span>;
  if (actuel <= min) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Alerte</span>;
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">OK</span>;
}

function StockBar({ actuel, min }: { actuel: number; min: number }) {
  const max = Math.max(actuel, min * 2, 1);
  const pct = Math.min((actuel / max) * 100, 100);
  const color = actuel <= 0 ? 'bg-red-500' : actuel <= min ? 'bg-orange-400' : 'bg-green-500';
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function StockPage() {
  const [mp, setMp] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAlert, setFilterAlert] = useState(false);
  const [filterInStock, setFilterInStock] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [editingSeuilId, setEditingSeuilId] = useState<string | null>(null);
  const [editingSeuilVal, setEditingSeuilVal] = useState<number>(0);
  const [filterCategorie, setFilterCategorie] = useState('');

  useEffect(() => { load(); }, []);

  async function saveSeuil(id: string) {
    await supabase.from('stock_items').update({ stock_min: editingSeuilVal }).eq('id', id);
    setMp(p => p.map(i => i.id === id ? { ...i, stock_min: editingSeuilVal } : i));
    setEditingSeuilId(null);
  }

  async function load() {
    const { data } = await supabase
      .from('stock_items')
      .select('*, supplier:suppliers(nom)')
      .order('nom');
    setMp(data || []);
    setLoading(false); // ne s'affiche que si mp est encore vide (premier chargement)
  }

  const categories = Array.from(new Set(mp.map(i => i.categorie).filter(Boolean))) as string[];

  const displayed = mp.filter(i => {
    const matchSearch = i.nom.toLowerCase().includes(search.toLowerCase()) ||
      (i.supplier?.nom ?? '').toLowerCase().includes(search.toLowerCase());
    const matchAlert = !filterAlert || i.stock_actuel <= i.stock_min;
    const matchInStock = !filterInStock || i.stock_actuel > 0;
    const matchCat = !filterCategorie || i.categorie === filterCategorie;
    return matchSearch && matchAlert && matchInStock && matchCat;
  });

  const enAlerte = mp.filter(i => i.stock_actuel <= i.stock_min && i.stock_actuel > 0).length;
  const enRupture = mp.filter(i => i.stock_actuel <= 0).length;
  const valeurStock = mp.reduce((s, i) => s + i.stock_actuel * i.prix_moyen_pondere, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock</h1>
          <p className="text-sm text-gray-400">{displayed.length} / {mp.length} article{mp.length > 1 ? 's' : ''}</p>
        </div>
        <Link href="/stock/articles"
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
          Gérer les articles
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-red-600">{enRupture}</p>
          <p className="text-xs text-gray-400 mt-0.5">Rupture</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-orange-500">{enAlerte}</p>
          <p className="text-xs text-gray-400 mt-0.5">En alerte</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-2xl font-black text-gray-900">{valeurStock >= 1000 ? `${(valeurStock / 1000).toFixed(1)}k` : valeurStock.toFixed(0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Valeur MAD</p>
        </div>
      </div>

      {/* Recherche + vue */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setViewMode('cards')}
            className={`px-3 py-2 transition-colors ${viewMode === 'cards' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
            <LayoutList size={15} />
          </button>
          <button onClick={() => setViewMode('table')}
            className={`px-3 py-2 transition-colors ${viewMode === 'table' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
            <Table2 size={15} />
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => { setFilterInStock(!filterInStock); setFilterAlert(false); }}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterInStock ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          En stock
        </button>
        {(enAlerte + enRupture) > 0 && (
          <button onClick={() => { setFilterAlert(!filterAlert); setFilterInStock(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterAlert ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
            <AlertTriangle size={13} />
            Alertes ({enAlerte + enRupture})
          </button>
        )}
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilterCategorie(filterCategorie === cat ? '' : cat)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterCategorie === cat ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {loading && mp.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun article</p>
        </div>
      ) : viewMode === 'table' ? (

        /* ── Vue tableau ── */
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[300px]">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs text-gray-400 uppercase">
                <th className="text-left px-4 py-3">Article</th>
                <th className="text-left px-3 py-3 hidden sm:table-cell">Catégorie</th>
                <th className="text-left px-3 py-3 hidden md:table-cell">Conditionnement</th>
                <th className="text-left px-3 py-3 hidden sm:table-cell">Fournisseur</th>
                <th className="text-right px-3 py-3 hidden sm:table-cell">Unité</th>
                <th className="text-right px-3 py-3">Stock</th>
                <th className="text-right px-3 py-3 hidden sm:table-cell">Seuil</th>
                <th className="text-right px-3 py-3 hidden md:table-cell">PMP</th>
                <th className="text-right px-3 py-3 hidden md:table-cell">Valeur</th>
                <th className="text-center px-3 py-3">État</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(item => {
                const valeur = item.stock_actuel * item.prix_moyen_pondere;
                return (
                  <tr key={item.id} className={`border-t border-gray-50 hover:bg-gray-50 transition-colors ${item.stock_actuel <= 0 ? 'bg-red-50/40' : item.stock_actuel <= item.stock_min ? 'bg-orange-50/40' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.nom}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs hidden sm:table-cell">{item.categorie ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs hidden md:table-cell">{item.conditionnement ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs hidden sm:table-cell">{item.supplier?.nom ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400 text-xs hidden sm:table-cell">{item.unite}</td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-bold text-gray-800">{item.stock_actuel}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                      {editingSeuilId === item.id ? (
                        <input
                          type="number" min={0} step={0.01}
                          value={editingSeuilVal}
                          onChange={e => setEditingSeuilVal(parseFloat(e.target.value) || 0)}
                          onBlur={() => saveSeuil(item.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveSeuil(item.id); if (e.key === 'Escape') setEditingSeuilId(null); }}
                          autoFocus
                          className="w-20 px-2 py-1 border border-blue-400 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingSeuilId(item.id); setEditingSeuilVal(item.stock_min); }}
                          className="text-gray-700 hover:text-blue-600 hover:underline cursor-pointer min-w-[2rem] text-right block w-full"
                        >
                          {item.stock_min}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400 text-xs hidden md:table-cell">
                      {item.prix_moyen_pondere > 0 ? `${item.prix_moyen_pondere.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 font-medium text-xs hidden md:table-cell">
                      {valeur > 0 ? `${valeur.toFixed(0)} MAD` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StockBadge actuel={item.stock_actuel} min={item.stock_min} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr className="text-xs text-gray-500 font-semibold">
                <td className="px-4 py-2.5" colSpan={8}>Total</td>
                <td className="px-3 py-2.5 text-right hidden md:table-cell">
                  {displayed.reduce((s, i) => s + i.stock_actuel * i.prix_moyen_pondere, 0).toFixed(0)} MAD
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

      ) : (

        /* ── Vue cards ── */
        <div className="space-y-2">
          {displayed.map(item => (
            <div key={item.id} className={`bg-white rounded-2xl border px-4 py-3 ${item.stock_actuel <= 0 ? 'border-red-100' : item.stock_actuel <= item.stock_min ? 'border-orange-100' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{item.nom}</p>
                    {item.categorie && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{item.categorie}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                    <span>{item.supplier?.nom ?? '—'}</span>
                    {item.conditionnement && <span>· {item.conditionnement}</span>}
                    {item.prix_moyen_pondere > 0 && <span>· {item.prix_moyen_pondere.toFixed(2)} MAD/{item.unite}</span>}
                  </p>
                </div>
                <StockBadge actuel={item.stock_actuel} min={item.stock_min} />
              </div>
              <div className="flex items-center gap-3">
                <StockBar actuel={item.stock_actuel} min={item.stock_min} />
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-800">{item.stock_actuel}</p>
                  <p className="text-xs text-gray-400">{item.unite}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
