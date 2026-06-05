'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Package, Search, LayoutList, Table2, Settings, Plus, Trash2, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockZone { id: string; nom: string; couleur: string; ordre: number; }

interface StockItem {
  id: string;
  nom: string;
  unite: string;
  stock_actuel: number;
  stock_min: number;
  prix_moyen_pondere: number;
  categorie: string | null;
  conditionnement: string | null;
  zone_id: string | null;
  zone?: StockZone | null;
  supplier: { nom: string } | null;
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

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

const COULEURS_PRESET = [
  '#6366f1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16',
];

// ─── Modal gestion des zones ──────────────────────────────────────────────────

function ZonesModal({ zones, onClose, onSaved }: {
  zones: StockZone[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [list, setList] = useState<StockZone[]>(zones);
  const [newNom, setNewNom] = useState('');
  const [newCouleur, setNewCouleur] = useState(COULEURS_PRESET[0]);
  const [saving, setSaving] = useState(false);

  async function addZone() {
    if (!newNom.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('stock_zones').insert({ nom: newNom.trim(), couleur: newCouleur, ordre: list.length }).select().single();
    if (data) setList(l => [...l, data as StockZone]);
    setNewNom('');
    setSaving(false);
  }

  async function deleteZone(id: string) {
    await supabase.from('stock_zones').delete().eq('id', id);
    setList(l => l.filter(z => z.id !== id));
  }

  async function updateNom(id: string, nom: string) {
    await supabase.from('stock_zones').update({ nom }).eq('id', id);
    setList(l => l.map(z => z.id === id ? { ...z, nom } : z));
  }

  async function updateCouleur(id: string, couleur: string) {
    await supabase.from('stock_zones').update({ couleur }).eq('id', id);
    setList(l => l.map(z => z.id === id ? { ...z, couleur } : z));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Zones de stock</h2>
          <button onClick={() => { onSaved(); onClose(); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {list.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune zone — créez-en une ci-dessous</p>
          )}
          {list.map(zone => (
            <ZoneRow key={zone.id} zone={zone} onUpdateNom={updateNom} onUpdateCouleur={updateCouleur} onDelete={deleteZone} />
          ))}
        </div>

        {/* Nouvelle zone */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">Nouvelle zone</p>
          <div className="flex gap-2">
            <input
              value={newNom} onChange={e => setNewNom(e.target.value)}
              placeholder="Ex : Chambre froide"
              onKeyDown={e => e.key === 'Enter' && addZone()}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={addZone} disabled={saving || !newNom.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              <Plus size={16} />
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {COULEURS_PRESET.map(c => (
              <button key={c} onClick={() => setNewCouleur(c)}
                className="w-6 h-6 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: newCouleur === c ? '#111' : 'transparent' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoneRow({ zone, onUpdateNom, onUpdateCouleur, onDelete }: {
  zone: StockZone;
  onUpdateNom: (id: string, nom: string) => void;
  onUpdateCouleur: (id: string, couleur: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nom, setNom] = useState(zone.nom);

  function save() {
    if (nom.trim()) onUpdateNom(zone.id, nom.trim());
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: zone.couleur }} />
      {editing ? (
        <input value={nom} onChange={e => setNom(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm focus:outline-none" />
      ) : (
        <button onClick={() => setEditing(true)} className="flex-1 text-left text-sm font-medium text-gray-800 hover:text-blue-600">
          {zone.nom}
        </button>
      )}
      <div className="flex gap-1">
        {COULEURS_PRESET.map(c => (
          <button key={c} onClick={() => onUpdateCouleur(zone.id, c)}
            className="w-4 h-4 rounded-full border transition-all"
            style={{ backgroundColor: c, borderColor: zone.couleur === c ? '#111' : 'transparent' }} />
        ))}
      </div>
      <button onClick={() => onDelete(zone.id)} className="p-1 text-gray-300 hover:text-red-500 rounded-lg transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function StockPage() {
  const [mp, setMp] = useState<StockItem[]>([]);
  const [zones, setZones] = useState<StockZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAlert, setFilterAlert] = useState(false);
  const [filterInStock, setFilterInStock] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [editingSeuilId, setEditingSeuilId] = useState<string | null>(null);
  const [editingSeuilVal, setEditingSeuilVal] = useState<number>(0);
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterZoneId, setFilterZoneId] = useState<string | null>(null);
  const [showZonesModal, setShowZonesModal] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    // Essaie d'abord avec la jointure zones (migration appliquée)
    const { data: items, error: itemsErr } = await supabase
      .from('stock_items')
      .select('*, supplier:suppliers(nom), zone:stock_zones(id, nom, couleur, ordre)')
      .order('nom');

    if (itemsErr) {
      // Migration pas encore appliquée — on charge sans la jointure zones
      const { data: itemsFallback } = await supabase
        .from('stock_items').select('*, supplier:suppliers(nom)').order('nom');
      setMp((itemsFallback as StockItem[]) || []);
    } else {
      setMp((items as StockItem[]) || []);
      const { data: z } = await supabase.from('stock_zones').select('*').order('ordre');
      setZones((z as StockZone[]) || []);
    }
    setLoading(false);
  }

  async function saveSeuil(id: string) {
    await supabase.from('stock_items').update({ stock_min: editingSeuilVal }).eq('id', id);
    setMp(p => p.map(i => i.id === id ? { ...i, stock_min: editingSeuilVal } : i));
    setEditingSeuilId(null);
  }

  const categories = Array.from(new Set(mp.map(i => i.categorie).filter(Boolean))) as string[];

  const displayed = mp.filter(i => {
    const matchSearch = i.nom.toLowerCase().includes(search.toLowerCase()) ||
      (i.supplier?.nom ?? '').toLowerCase().includes(search.toLowerCase());
    const matchAlert = !filterAlert || i.stock_actuel <= i.stock_min;
    const matchInStock = !filterInStock || i.stock_actuel > 0;
    const matchCat = !filterCategorie || i.categorie === filterCategorie;
    const matchZone = filterZoneId === null ? true : filterZoneId === '__sans' ? !i.zone_id : i.zone_id === filterZoneId;
    return matchSearch && matchAlert && matchInStock && matchCat && matchZone;
  });

  const enAlerte = mp.filter(i => i.stock_actuel <= i.stock_min && i.stock_actuel > 0).length;
  const enRupture = mp.filter(i => i.stock_actuel <= 0).length;
  const valeurStock = displayed.reduce((s, i) => s + i.stock_actuel * i.prix_moyen_pondere, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock</h1>
          <p className="text-sm text-gray-400">{displayed.length} / {mp.length} article{mp.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowZonesModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
            <Settings size={14} /> Zones
          </button>
          <Link href="/stock/articles"
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            Gérer les articles
          </Link>
        </div>
      </div>

      {/* Onglets zones */}
      {zones.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <button onClick={() => setFilterZoneId(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterZoneId === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Toutes
          </button>
          {zones.map(z => (
            <button key={z.id} onClick={() => setFilterZoneId(filterZoneId === z.id ? null : z.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterZoneId === z.id ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              style={filterZoneId === z.id ? { backgroundColor: z.couleur, borderColor: z.couleur } : {}}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: filterZoneId === z.id ? 'white' : z.couleur }} />
              {z.nom}
            </button>
          ))}
          <button onClick={() => setFilterZoneId('__sans')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterZoneId === '__sans' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
            Sans zone
          </button>
        </div>
      )}

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
          <p className="text-xs text-gray-400 mt-0.5">Valeur MAD{filterZoneId !== null ? ' (zone)' : ''}</p>
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
                <th className="text-left px-3 py-3 hidden sm:table-cell">Zone</th>
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
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      {item.zone ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium text-white"
                          style={{ backgroundColor: item.zone.couleur }}>
                          {item.zone.nom}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
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
                          className="w-20 px-2 py-1 border border-blue-400 rounded-lg text-sm text-right focus:outline-none"
                        />
                      ) : (
                        <button onClick={() => { setEditingSeuilId(item.id); setEditingSeuilVal(item.stock_min); }}
                          className="text-gray-700 hover:text-blue-600 hover:underline cursor-pointer min-w-[2rem] text-right block w-full">
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
                <td className="px-4 py-2.5" colSpan={9}>Total</td>
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
                    {item.zone && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                        style={{ backgroundColor: item.zone.couleur }}>
                        {item.zone.nom}
                      </span>
                    )}
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

      {/* Modal zones */}
      {showZonesModal && (
        <ZonesModal
          zones={zones}
          onClose={() => setShowZonesModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
