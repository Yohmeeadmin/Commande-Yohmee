'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Package, Pencil, Trash2, X, TrendingDown, AlertTriangle, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier { id: string; nom: string; }
interface StockZone { id: string; nom: string; couleur: string; }

interface StockItem {
  id: string;
  nom: string;
  unite: string;
  stock_actuel: number;
  stock_min: number;
  prix_moyen_pondere: number;
  supplier_id: string | null;
  categorie: string | null;
  conditionnement: string | null;
  poids_conditionnement: number;
  prix_achat: number;
  zone_id: string | null;
  supplier?: { nom: string } | null;
  zone?: StockZone | null;
}

type StatusFilter = 'all' | 'rupture' | 'alerte' | 'ok' | 'en_stock';

// ─── Constantes ───────────────────────────────────────────────────────────────

const UNITES        = ['kg', 'g', 'L', 'cl', 'pièce', 'sachet', 'boîte', 'carton', 'litre'];
const CONDITIONNEMENTS = ['Sac', 'Carton', 'Bidon', 'Bouteille', 'Pot', 'Boîte', 'Barquette', 'Sachet', 'Fût', 'Jerrycan', 'Pièce', 'Palette'];

const emptyItem = (): Omit<StockItem, 'id' | 'supplier' | 'zone'> => ({
  nom: '', unite: 'kg', stock_actuel: 0, stock_min: 0, prix_moyen_pondere: 0,
  supplier_id: null, categorie: null, conditionnement: null,
  poids_conditionnement: 0, prix_achat: 0, zone_id: null,
});

function statusOf(i: StockItem): 'rupture' | 'alerte' | 'ok' {
  if ((i.stock_actuel ?? 0) <= 0) return 'rupture';
  if ((i.stock_actuel ?? 0) <= (i.stock_min ?? 0)) return 'alerte';
  return 'ok';
}

// ─── Formulaire article ────────────────────────────────────────────────────

function ItemForm({ itemForm, IF, stockCategories, suppliers, zones }: {
  itemForm: Omit<StockItem, 'id' | 'supplier' | 'zone'>;
  IF: (k: keyof Omit<StockItem, 'id' | 'supplier' | 'zone'>, v: any) => void;
  stockCategories: { id: string; nom: string }[];
  suppliers: Supplier[];
  zones: StockZone[];
}) {
  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500 font-medium">Nom *</span>
        <input value={itemForm.nom} onChange={e => IF('nom', e.target.value)} placeholder="Ex : Farine T55"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium">Catégorie</span>
          <select value={itemForm.categorie ?? ''} onChange={e => IF('categorie', e.target.value || null)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Aucune</option>
            {stockCategories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium">Fournisseur</span>
          <select value={itemForm.supplier_id ?? ''} onChange={e => IF('supplier_id', e.target.value || null)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Aucun</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
      </div>

      {zones.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium">Zone de stockage</span>
          <select value={itemForm.zone_id ?? ''} onChange={e => IF('zone_id', e.target.value || null)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Aucune zone</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
          </select>
        </label>
      )}

      <div className="border-t border-gray-100 pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conditionnement</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">Type</span>
            <select value={itemForm.conditionnement ?? ''} onChange={e => IF('conditionnement', e.target.value || null)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Choisir</option>
              {CONDITIONNEMENTS.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">Unité</span>
            <select value={itemForm.unite} onChange={e => IF('unite', e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {UNITES.map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">Poids/volume ({itemForm.unite})</span>
            <input type="number" min={0} step={0.001} value={itemForm.poids_conditionnement || ''}
              onChange={e => IF('poids_conditionnement', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">Prix colis (MAD)</span>
            <input type="number" min={0} step={0.01} value={itemForm.prix_achat || ''}
              onChange={e => IF('prix_achat', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>
        {itemForm.poids_conditionnement > 0 && itemForm.prix_achat > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 rounded-xl">
            <span className="text-sm text-blue-700">Prix au {itemForm.unite}</span>
            <span className="text-base font-black text-blue-700">
              {(itemForm.prix_achat / itemForm.poids_conditionnement).toFixed(2)} MAD/{itemForm.unite}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">Stock actuel ({itemForm.unite})</span>
            <input type="number" min={0} step={0.01} value={itemForm.stock_actuel || ''}
              onChange={e => IF('stock_actuel', parseFloat(e.target.value) || 0)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium">Seuil d'alerte ({itemForm.unite})</span>
            <input type="number" min={0} step={0.01} value={itemForm.stock_min || ''}
              onChange={e => IF('stock_min', parseFloat(e.target.value) || 0)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Badge état ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'rupture' | 'alerte' | 'ok' }) {
  if (status === 'rupture') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700 uppercase tracking-wide">
      <TrendingDown size={9} /> Rupture
    </span>
  );
  if (status === 'alerte') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 uppercase tracking-wide">
      <AlertTriangle size={9} /> Alerte
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 uppercase tracking-wide">
      <Check size={9} /> OK
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ArticlesPage() {
  const [items, setItems]               = useState<StockItem[]>([]);
  const [suppliers, setSuppliers]       = useState<Supplier[]>([]);
  const [stockCategories, setStockCategories] = useState<{ id: string; nom: string }[]>([]);
  const [zones, setZones]               = useState<StockZone[]>([]);
  const [loading, setLoading]           = useState(true);

  // Filtres
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [catFilter, setCatFilter]       = useState('');

  // Formulaire
  const [editItem, setEditItem]         = useState<StockItem | null>(null);
  const [showNew, setShowNew]           = useState(false);
  const [itemForm, setItemForm]         = useState(emptyItem());
  const [saving, setSaving]             = useState(false);

  // Édition inline catégorie + seuil
  const [editingCatId, setEditingCatId]     = useState<string | null>(null);
  const [editingSeuilId, setEditingSeuilId] = useState<string | null>(null);
  const [editingSeuilVal, setEditingSeuilVal] = useState<string>('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: sup }, { data: sc }] = await Promise.all([
      supabase.from('suppliers').select('id, nom').order('nom'),
      supabase.from('stock_categories').select('id, nom').order('ordre'),
    ]);
    setSuppliers(sup || []);
    setStockCategories(sc || []);

    const { data: it, error } = await supabase
      .from('stock_items')
      .select('*, supplier:suppliers(nom), zone:stock_zones(id, nom, couleur)')
      .order('nom');
    if (error) {
      const { data: fb } = await supabase.from('stock_items').select('*, supplier:suppliers(nom)').order('nom');
      setItems((fb as StockItem[]) || []);
    } else {
      setItems((it as StockItem[]) || []);
      const { data: z } = await supabase.from('stock_zones').select('id, nom, couleur').order('ordre');
      setZones((z as StockZone[]) || []);
    }
    setLoading(false);
  }

  const IF = (k: keyof typeof itemForm, v: any) => setItemForm(p => ({ ...p, [k]: v }));

  async function saveItem() {
    if (!itemForm.nom.trim()) return;
    setSaving(true);
    const pmp = itemForm.poids_conditionnement > 0 && itemForm.prix_achat > 0
      ? itemForm.prix_achat / itemForm.poids_conditionnement
      : itemForm.prix_moyen_pondere;
    const payload = { ...itemForm, supplier_id: itemForm.supplier_id || null, prix_moyen_pondere: pmp };
    if (editItem) {
      await supabase.from('stock_items').update(payload).eq('id', editItem.id);
      setEditItem(null);
    } else {
      await supabase.from('stock_items').insert(payload);
      setShowNew(false);
    }
    setItemForm(emptyItem());
    setSaving(false);
    load();
  }

  async function deleteItem(id: string) {
    if (!confirm('Supprimer cet article ?')) return;
    await supabase.from('stock_items').delete().eq('id', id);
    setItems(p => p.filter(i => i.id !== id));
  }

  function startEdit(item: StockItem) {
    setEditItem(item);
    setShowNew(false);
    const poids = item.poids_conditionnement || 0;
    const prix  = item.prix_achat || (poids > 0 ? item.prix_moyen_pondere * poids : item.prix_moyen_pondere);
    setItemForm({
      nom: item.nom, unite: item.unite,
      stock_actuel: item.stock_actuel, stock_min: item.stock_min,
      prix_moyen_pondere: item.prix_moyen_pondere,
      supplier_id: item.supplier_id, categorie: item.categorie,
      conditionnement: item.conditionnement,
      poids_conditionnement: poids, prix_achat: prix,
      zone_id: item.zone_id,
    });
  }

  async function saveCatInline(id: string, val: string) {
    const v = val || null;
    await supabase.from('stock_items').update({ categorie: v }).eq('id', id);
    setItems(p => p.map(i => i.id === id ? { ...i, categorie: v } : i));
    setEditingCatId(null);
  }

  function startEditSeuil(item: StockItem) {
    setEditingSeuilId(item.id);
    setEditingSeuilVal(String(item.stock_min ?? 0));
  }

  async function saveSeuilInline(id: string) {
    const v = Math.round(parseFloat(editingSeuilVal) || 0);
    await supabase.from('stock_items').update({ stock_min: v }).eq('id', id);
    setItems(p => p.map(i => i.id === id ? { ...i, stock_min: v } : i));
    setEditingSeuilId(null);
  }

  // ── Compteurs ─────────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    rupture:  items.filter(i => statusOf(i) === 'rupture').length,
    alerte:   items.filter(i => statusOf(i) === 'alerte').length,
    ok:       items.filter(i => statusOf(i) === 'ok').length,
    en_stock: items.filter(i => i.stock_actuel > 0).length,
  }), [items]);

  const categories = useMemo(() =>
    Array.from(new Set(items.map(i => i.categorie).filter(Boolean) as string[])).sort(),
    [items]
  );

  // ── Filtrage + tri ────────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    const ORDER = { rupture: 0, alerte: 1, ok: 2 };
    return items
      .filter(i => {
        const st = statusOf(i);
        if (statusFilter === 'en_stock' && i.stock_actuel <= 0) return false;
        if (statusFilter !== 'all' && statusFilter !== 'en_stock' && st !== statusFilter) return false;
        if (catFilter && i.categorie !== catFilter) return false;
        if (search && !i.nom.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const da = ORDER[statusOf(a)], db = ORDER[statusOf(b)];
        if (da !== db) return da - db;
        return a.nom.localeCompare(b.nom);
      });
  }, [items, statusFilter, catFilter, search]);

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Articles</h2>
          <p className="text-sm text-gray-400">{items.length} matières premières</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditItem(null); setItemForm(emptyItem()); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Nouvel article
        </button>
      </div>

      {/* ── Formulaire nouvel article ────────────────────────────────── */}
      {showNew && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="font-bold text-gray-900">Nouvel article</p>
            <button onClick={() => { setShowNew(false); setItemForm(emptyItem()); }}>
              <X size={18} className="text-gray-400" />
            </button>
          </div>
          <div className="px-5 py-4">
            <ItemForm itemForm={itemForm} IF={IF} stockCategories={stockCategories} suppliers={suppliers} zones={zones} />
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
            <button onClick={() => { setShowNew(false); setItemForm(emptyItem()); }}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
            <button onClick={saveItem} disabled={saving || !itemForm.nom.trim()}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-blue-700">
              {saving ? 'Enregistrement…' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {/* ── Pills catégories ─────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <button onClick={() => setCatFilter('')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${catFilter === '' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Tous
          </button>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(catFilter === c ? '' : c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${catFilter === c ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* ── Stat cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <button onClick={() => setStatusFilter(statusFilter === 'en_stock' ? 'all' : 'en_stock')}
          className={`rounded-2xl border px-4 py-3 text-left transition-all ${statusFilter === 'en_stock' ? 'bg-green-50 border-green-300' : 'bg-white border-gray-100 hover:border-green-200'}`}>
          <p className="text-xl font-black text-green-600">{counts.en_stock}</p>
          <p className="text-xs text-gray-400 mt-0.5">En stock</p>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'rupture' ? 'all' : 'rupture')}
          className={`rounded-2xl border px-4 py-3 text-left transition-all ${statusFilter === 'rupture' ? 'bg-red-50 border-red-300' : 'bg-white border-gray-100 hover:border-red-200'}`}>
          <p className={`text-xl font-black ${counts.rupture > 0 ? 'text-red-600' : 'text-gray-300'}`}>{counts.rupture}</p>
          <p className="text-xs text-gray-400 mt-0.5">Rupture</p>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'alerte' ? 'all' : 'alerte')}
          className={`rounded-2xl border px-4 py-3 text-left transition-all ${statusFilter === 'alerte' ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-100 hover:border-orange-200'}`}>
          <p className={`text-xl font-black ${counts.alerte > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{counts.alerte}</p>
          <p className="text-xs text-gray-400 mt-0.5">Alerte seuil</p>
        </button>
        <button onClick={() => setStatusFilter(statusFilter === 'ok' ? 'all' : 'ok')}
          className={`rounded-2xl border px-4 py-3 text-left transition-all ${statusFilter === 'ok' ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-100 hover:border-blue-200'}`}>
          <p className={`text-xl font-black ${counts.ok > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{counts.ok}</p>
          <p className="text-xs text-gray-400 mt-0.5">OK</p>
        </button>
      </div>

      {/* ── Recherche ────────────────────────────────────────────────── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un article…"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* ── Résultat ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun article trouvé</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

          {/* Compteur résultats */}
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">{displayed.length} article{displayed.length > 1 ? 's' : ''}</p>
          </div>

          {/* ── Table desktop ── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Article</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fournisseur</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Catégorie</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Stock actuel</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Seuil</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Prix/unité</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">État</th>
                  <th className="px-4 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map(item => {
                  const status = statusOf(item);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{item.nom}</p>
                        {item.conditionnement && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.conditionnement}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {item.supplier?.nom ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {editingCatId === item.id ? (
                          <select autoFocus value={item.categorie ?? ''}
                            onChange={e => saveCatInline(item.id, e.target.value)}
                            onBlur={() => setEditingCatId(null)}
                            className="px-2 py-1 border border-blue-400 rounded-lg text-sm bg-white focus:outline-none">
                            <option value="">— Aucune</option>
                            {stockCategories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setEditingCatId(item.id)}
                            className={`text-sm rounded px-1 -ml-1 hover:bg-blue-50 hover:text-blue-600 transition-colors ${item.categorie ? 'text-gray-500' : 'text-gray-300'}`}>
                            {item.categorie ?? '+ Catégorie'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold tabular-nums ${status === 'rupture' ? 'text-red-600' : status === 'alerte' ? 'text-orange-600' : 'text-gray-900'}`}>
                          {item.stock_actuel}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{item.unite}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingSeuilId === item.id ? (
                          <input
                            autoFocus
                            type="number" min={0} step={1}
                            value={editingSeuilVal}
                            onChange={e => setEditingSeuilVal(e.target.value)}
                            onBlur={() => saveSeuilInline(item.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveSeuilInline(item.id);
                              if (e.key === 'Escape') setEditingSeuilId(null);
                            }}
                            className="w-20 text-right px-2 py-1 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <button
                            onClick={() => startEditSeuil(item)}
                            className={`tabular-nums text-sm rounded px-1 -mr-1 hover:bg-blue-50 hover:text-blue-600 transition-colors ${item.stock_min > 0 ? 'text-gray-400' : 'text-gray-200'}`}
                            title="Cliquer pour modifier le seuil"
                          >
                            {item.stock_min > 0 ? item.stock_min : '+ seuil'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-400 text-sm tabular-nums">
                        {item.prix_moyen_pondere > 0 ? `${item.prix_moyen_pondere.toFixed(2)} MAD` : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(item)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteItem(item.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Cartes mobile ── */}
          <div className="sm:hidden divide-y divide-gray-50">
            {displayed.map(item => {
              const status = statusOf(item);
              return (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{item.nom}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.supplier?.nom ?? '—'}
                      {item.categorie && ` · ${item.categorie}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm tabular-nums ${status === 'rupture' ? 'text-red-600' : status === 'alerte' ? 'text-orange-600' : 'text-gray-900'}`}>
                      {item.stock_actuel} <span className="font-normal text-xs text-gray-400">{item.unite}</span>
                    </p>
                    {item.stock_min > 0 && (
                      <p className="text-xs text-gray-400">min {item.stock_min}</p>
                    )}
                  </div>
                  <StatusBadge status={status} />
                  <button onClick={() => startEdit(item)}
                    className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Pencil size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal édition ─────────────────────────────────────────────── */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900">Modifier l'article</p>
                <p className="text-xs text-gray-400 mt-0.5">{editItem.nom}</p>
              </div>
              <button onClick={() => { setEditItem(null); setItemForm(emptyItem()); }}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <ItemForm itemForm={itemForm} IF={IF} stockCategories={stockCategories} suppliers={suppliers} zones={zones} />
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => { setEditItem(null); setItemForm(emptyItem()); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={saveItem} disabled={saving || !itemForm.nom.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-blue-700">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
