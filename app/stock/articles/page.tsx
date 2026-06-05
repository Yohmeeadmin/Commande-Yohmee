'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Package, Edit2, Trash2, X, AlertTriangle, ChevronDown, ChevronUp, LayoutList, Table2 } from 'lucide-react';
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

interface ProductArticle {
  id: string;
  pack_type: string;
  quantity: number;
  product_state: string;
  display_name: string;
  custom_price: number | null;
  prix_pro: number | null;
  is_active: boolean;
}

interface Company { id: string; name: string; }

interface ProductReference {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  base_unit_price: number;
  is_active: boolean;
  category?: { nom: string } | null;
  atelier?: string | null;
  articles?: ProductArticle[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const UNITES = ['kg', 'g', 'L', 'cl', 'pièce', 'sachet', 'boîte', 'carton', 'litre'];

const emptyItem = (): Omit<StockItem, 'id' | 'supplier' | 'zone'> => ({
  nom: '', unite: 'kg', stock_actuel: 0, stock_min: 0, prix_moyen_pondere: 0,
  supplier_id: null, categorie: null, conditionnement: null,
  poids_conditionnement: 0, prix_achat: 0, zone_id: null,
});

// ─── Formulaire article (partagé modal + carte) ──────────────────────────────

const CONDITIONNEMENTS = ['Sac', 'Carton', 'Bidon', 'Bouteille', 'Pot', 'Boîte', 'Barquette', 'Sachet', 'Fût', 'Jerrycan', 'Pièce', 'Palette'];

function ItemForm({ itemForm, IF, stockCategories, suppliers, zones }: {
  itemForm: Omit<StockItem, 'id' | 'supplier' | 'zone'>;
  IF: (k: keyof Omit<StockItem, 'id' | 'supplier' | 'zone'>, v: any) => void;
  stockCategories: { id: string; nom: string }[];
  suppliers: Supplier[];
  zones: StockZone[];
}) {
  return (
    <div className="space-y-4">
      {/* Nom */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500 font-medium px-1">Nom de l'article *</span>
        <input value={itemForm.nom} onChange={e => IF('nom', e.target.value)} placeholder="Ex : Farine T55"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </label>

      {/* Catégorie + Fournisseur */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium px-1">Catégorie</span>
          <select value={itemForm.categorie ?? ''} onChange={e => IF('categorie', e.target.value || null)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Aucune</option>
            {stockCategories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium px-1">Fournisseur</span>
          <select value={itemForm.supplier_id ?? ''} onChange={e => IF('supplier_id', e.target.value || null)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Aucun</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
      </div>

      {/* Zone de stockage */}
      {zones.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium px-1">Zone de stockage</span>
          <select value={itemForm.zone_id ?? ''} onChange={e => IF('zone_id', e.target.value || null)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Aucune zone</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
          </select>
        </label>
      )}

      {/* Conditionnement */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Conditionnement</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium px-1">Type</span>
            <select value={itemForm.conditionnement ?? ''} onChange={e => IF('conditionnement', e.target.value || null)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Choisir</option>
              {CONDITIONNEMENTS.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium px-1">Unité</span>
            <select value={itemForm.unite} onChange={e => IF('unite', e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {UNITES.map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium px-1">Poids / volume ({itemForm.unite})</span>
            <input type="number" min={0} step={0.001} value={itemForm.poids_conditionnement || ''}
              onChange={e => IF('poids_conditionnement', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium px-1">Prix d'achat du colis (MAD)</span>
            <input type="number" min={0} step={0.01} value={itemForm.prix_achat || ''}
              onChange={e => IF('prix_achat', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>

        {itemForm.poids_conditionnement > 0 && itemForm.prix_achat > 0 && (
          <div className="mt-3 flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl">
            <span className="text-sm text-blue-700">Prix au {itemForm.unite}</span>
            <span className="text-lg font-black text-blue-700">
              {(itemForm.prix_achat / itemForm.poids_conditionnement).toFixed(2)} MAD/{itemForm.unite}
            </span>
          </div>
        )}
      </div>

      {/* Stock */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Stock</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium px-1">Stock actuel ({itemForm.unite})</span>
            <input type="number" min={0} step={0.01} value={itemForm.stock_actuel || ''}
              onChange={e => IF('stock_actuel', parseFloat(e.target.value) || 0)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 font-medium px-1">Seuil d'alerte ({itemForm.unite})</span>
            <input type="number" min={0} step={0.01} value={itemForm.stock_min || ''}
              onChange={e => IF('stock_min', parseFloat(e.target.value) || 0)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArticlesPage() {
  const [tab, setTab] = useState<'mp' | 'pf'>('mp');

  // MP state
  const [items, setItems] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockCategories, setStockCategories] = useState<{ id: string; nom: string }[]>([]);
  const [zones, setZones] = useState<StockZone[]>([]);
  const [loadingMp, setLoadingMp] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAlert, setFilterAlert] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItem());
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [itemStats, setItemStats] = useState<Record<string, { week: number; month: number; year: number }>>({});
  const [editingCategorieId, setEditingCategorieId] = useState<string | null>(null);
  const [editingConditionnementId, setEditingConditionnementId] = useState<string | null>(null);

  // PF state
  const [refs, setRefs] = useState<ProductReference[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [loadingPf, setLoadingPf] = useState(false);
  const [searchPf, setSearchPf] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [expandedPfId, setExpandedPfId] = useState<string | null>(null);

  useEffect(() => { loadMp(); }, []);

  useEffect(() => {
    if (tab === 'pf') {
      if (companies.length === 0) loadCompanies();
      else if (selectedCompanyId) loadPf(selectedCompanyId);
    }
  }, [tab]);

  useEffect(() => {
    if (selectedCompanyId) loadPf(selectedCompanyId);
  }, [selectedCompanyId]);

  async function loadMp() {
    const [{ data: sup }, { data: sc }] = await Promise.all([
      supabase.from('suppliers').select('id, nom').order('nom'),
      supabase.from('stock_categories').select('id, nom').order('ordre'),
    ]);
    setSuppliers(sup || []);
    setStockCategories(sc || []);

    // Jointure zones — gracieuse si la migration n'est pas encore appliquée
    const { data: it, error: itErr } = await supabase
      .from('stock_items').select('*, supplier:suppliers(nom), zone:stock_zones(id, nom, couleur)').order('nom');
    if (itErr) {
      const { data: itFallback } = await supabase.from('stock_items').select('*, supplier:suppliers(nom)').order('nom');
      setItems((itFallback as StockItem[]) || []);
    } else {
      setItems((it as StockItem[]) || []);
      const { data: z } = await supabase.from('stock_zones').select('id, nom, couleur').order('ordre');
      setZones((z as StockZone[]) || []);
    }
    setLoadingMp(false);
  }

  async function loadCompanies() {
    const { data } = await supabase.from('companies').select('id, name').order('name');
    const list = data || [];
    setCompanies(list);
    const saved = localStorage.getItem('catalogue_company_id');
    const initial = list.find((c: Company) => c.id === saved) ? saved! : list[0]?.id ?? '';
    setSelectedCompanyId(initial);
  }

  async function loadPf(companyId: string) {
    if (!companyId) return;
    setLoadingPf(true);
    const { data } = await supabase
      .from('product_references')
      .select('*, category:categories(nom), articles:product_articles(id, pack_type, quantity, product_state, display_name, custom_price, prix_pro, is_active)')
      .eq('company_id', companyId)
      .order('name');
    setRefs((data as ProductReference[]) || []);
    setLoadingPf(false);
  }

  async function loadItemStats(itemId: string) {
    if (itemStats[itemId]) return; // déjà chargé
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
    const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);

    const { data } = await supabase
      .from('supplier_invoice_lines')
      .select('quantite, supplier_invoices!inner(date_facture, statut)')
      .eq('stock_item_id', itemId)
      .eq('supplier_invoices.statut', 'validee');

    if (!data) return;
    const sum = (fromDate: Date) => data
      .filter((r: any) => new Date(r.supplier_invoices.date_facture) >= fromDate)
      .reduce((s: number, r: any) => s + (r.quantite || 0), 0);

    setItemStats(p => ({ ...p, [itemId]: { week: sum(weekAgo), month: sum(monthAgo), year: sum(yearAgo) } }));
  }

  function toggleItemExpand(id: string) {
    const next = expandedItemId === id ? null : id;
    setExpandedItemId(next);
    if (next) loadItemStats(next);
  }

  // ── CRUD MP ────────────────────────────────────────────────────────────────

  const IF = (k: keyof typeof itemForm, v: any) => setItemForm(p => ({ ...p, [k]: v }));

  async function saveItem() {
    if (!itemForm.nom.trim()) return;
    setSaving(true);
    // Auto-calcul PMP = prix_achat / poids_conditionnement
    const pmp = itemForm.poids_conditionnement > 0 && itemForm.prix_achat > 0
      ? itemForm.prix_achat / itemForm.poids_conditionnement
      : itemForm.prix_moyen_pondere;
    const payload = { ...itemForm, supplier_id: itemForm.supplier_id || null, prix_moyen_pondere: pmp };
    if (editItem) {
      await supabase.from('stock_items').update(payload).eq('id', editItem.id);
      await loadMp();
      setEditItem(null);
    } else {
      await supabase.from('stock_items').insert(payload);
      await loadMp();
      setShowNewItem(false);
    }
    setItemForm(emptyItem());
    setSaving(false);
  }

  async function saveCategorie(id: string, value: string) {
    const val = value || null;
    await supabase.from('stock_items').update({ categorie: val }).eq('id', id);
    setItems(p => p.map(i => i.id === id ? { ...i, categorie: val } : i));
    setEditingCategorieId(null);
  }

  async function saveConditionnement(id: string, value: string) {
    const val = value || null;
    await supabase.from('stock_items').update({ conditionnement: val }).eq('id', id);
    setItems(p => p.map(i => i.id === id ? { ...i, conditionnement: val } : i));
    setEditingConditionnementId(null);
  }

  async function deleteItem(id: string) {
    if (!confirm('Supprimer cet article ? Cela peut affecter les factures liées.')) return;
    await supabase.from('stock_items').delete().eq('id', id);
    setItems(p => p.filter(i => i.id !== id));
  }

  function startEdit(item: StockItem) {
    setEditItem(item);
    setShowNewItem(false);
    const poids = item.poids_conditionnement || 0;
    // Prix achat : valeur enregistrée, sinon PMP × poids si possible, sinon PMP seul
    const prix = item.prix_achat
      || (poids > 0 && item.prix_moyen_pondere > 0 ? item.prix_moyen_pondere * poids : 0)
      || item.prix_moyen_pondere;
    setItemForm({
      nom: item.nom, unite: item.unite,
      stock_actuel: item.stock_actuel, stock_min: item.stock_min,
      prix_moyen_pondere: item.prix_moyen_pondere,
      supplier_id: item.supplier_id, categorie: item.categorie,
      conditionnement: item.conditionnement,
      poids_conditionnement: poids,
      prix_achat: prix,
      zone_id: item.zone_id,
    });
  }

  // ── Filtres MP ─────────────────────────────────────────────────────────────

  const filtered = items.filter(i => {
    const matchSearch = i.nom.toLowerCase().includes(search.toLowerCase());
    const matchAlert = !filterAlert || i.stock_actuel <= i.stock_min;
    return matchSearch && matchAlert;
  });

  const enAlerte = items.filter(i => i.stock_actuel <= i.stock_min && i.stock_actuel > 0).length;
  const enRupture = items.filter(i => i.stock_actuel <= 0).length;

  // ── Filtres PF ─────────────────────────────────────────────────────────────

  const filteredPf = refs.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(searchPf.toLowerCase()) || r.code.toLowerCase().includes(searchPf.toLowerCase());
    const matchActive = showInactive || r.is_active;
    return matchSearch && matchActive;
  });

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Articles</h1>
          <p className="text-sm text-gray-400">
            {tab === 'mp' ? `${items.length} matière${items.length > 1 ? 's' : ''} première${items.length > 1 ? 's' : ''}` : `${refs.length} produit${refs.length > 1 ? 's' : ''} fini${refs.length > 1 ? 's' : ''}`}
          </p>
        </div>
        {tab === 'mp' && (
          <button onClick={() => { setShowNewItem(true); setEditItem(null); setItemForm(emptyItem()); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={15} /> Article
          </button>
        )}
        {tab === 'pf' && null}
      </div>

      {/* Sélecteur MP / PF */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit">
        <button onClick={() => setTab('mp')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'mp' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Matières premières
        </button>
        <button onClick={() => setTab('pf')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'pf' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Produits finis
        </button>
      </div>

      {/* ═══ MODAL ÉDITION ═══════════════════════════════════════════════════ */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh]">
            {/* Header fixe */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900">Modifier l'article</p>
                <p className="text-xs text-gray-400 mt-0.5">{editItem.nom}</p>
              </div>
              <button onClick={() => { setEditItem(null); setItemForm(emptyItem()); }}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {/* Corps scrollable */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <ItemForm itemForm={itemForm} IF={IF} stockCategories={stockCategories} suppliers={suppliers} zones={zones} />
            </div>

            {/* Footer fixe */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => { setEditItem(null); setItemForm(emptyItem()); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
              <button onClick={saveItem} disabled={saving || !itemForm.nom.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ONGLET MP ═══════════════════════════════════════════════════════ */}
      {tab === 'mp' && (
        <>
          {/* Formulaire nouveau article (carte inline) */}
          {showNewItem && (
            <div className="bg-white rounded-2xl border border-green-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-900">Nouvel article</p>
                <button onClick={() => { setShowNewItem(false); setItemForm(emptyItem()); }}>
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
              <ItemForm itemForm={itemForm} IF={IF} stockCategories={stockCategories} suppliers={suppliers} zones={zones} />
              <div className="flex gap-2">
                <button onClick={() => { setShowNewItem(false); setItemForm(emptyItem()); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
                <button onClick={saveItem} disabled={saving || !itemForm.nom.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                  {saving ? 'Enregistrement…' : 'Ajouter'}
                </button>
              </div>
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
              <p className="text-2xl font-black text-gray-900">{items.reduce((s, i) => s + i.stock_actuel * i.prix_moyen_pondere, 0).toFixed(0)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Valeur MAD</p>
            </div>
          </div>

          {/* Recherche + filtre + vue */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
            {(enAlerte + enRupture) > 0 && (
              <button onClick={() => setFilterAlert(!filterAlert)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${filterAlert ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
                <AlertTriangle size={14} />
                {enAlerte + enRupture}
              </button>
            )}
            <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setViewMode('cards')} className={`px-3 py-2 ${viewMode === 'cards' ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}><LayoutList size={15} /></button>
              <button onClick={() => setViewMode('table')} className={`px-3 py-2 ${viewMode === 'table' ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}><Table2 size={15} /></button>
            </div>
          </div>

          {/* Liste MP */}
          {loadingMp ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Package className="text-gray-200 mx-auto mb-3" size={40} />
              <p className="text-gray-400 font-medium">Aucun article</p>
            </div>
          ) : viewMode === 'table' ? (
            /* ── Vue tableau ── */
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead className="border-b border-gray-100">
                  <tr className="text-xs text-gray-400 uppercase">
                    <th className="text-left px-4 py-2.5">Article</th>
                    <th className="text-left px-3 py-2.5 hidden sm:table-cell">Catégorie</th>
                    <th className="text-left px-3 py-2.5 hidden sm:table-cell">Conditionnement</th>
                    <th className="text-left px-3 py-2.5 hidden sm:table-cell">Fournisseur</th>
                    <th className="text-right px-3 py-2.5">Stock</th>
                    <th className="text-right px-3 py-2.5">Min</th>
                    <th className="text-right px-3 py-2.5 hidden sm:table-cell">Prix/unité</th>
                    <th className="text-right px-3 py-2.5">État</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{item.nom}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        {editingCategorieId === item.id ? (
                          <select autoFocus value={item.categorie ?? ''}
                            onChange={e => saveCategorie(item.id, e.target.value)}
                            onBlur={() => setEditingCategorieId(null)}
                            className="px-2 py-1 border border-blue-400 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">— Aucune</option>
                            {stockCategories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setEditingCategorieId(item.id)}
                            className="text-gray-400 hover:text-blue-600 hover:underline cursor-pointer text-left">
                            {item.categorie ?? '—'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        {editingConditionnementId === item.id ? (
                          <select autoFocus value={item.conditionnement ?? ''}
                            onChange={e => saveConditionnement(item.id, e.target.value)}
                            onBlur={() => setEditingConditionnementId(null)}
                            className="px-2 py-1 border border-blue-400 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">— Aucun</option>
                            {CONDITIONNEMENTS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setEditingConditionnementId(item.id)}
                            className="text-gray-400 hover:text-blue-600 hover:underline cursor-pointer text-left">
                            {item.conditionnement ?? '—'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 hidden sm:table-cell">{item.supplier?.nom ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{item.stock_actuel} <span className="text-xs font-normal text-gray-400">{item.unite}</span></td>
                      <td className="px-3 py-2.5 text-right text-gray-400">{item.stock_min}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400 hidden sm:table-cell">{item.prix_moyen_pondere > 0 ? `${item.prix_moyen_pondere.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right"><StockBadge actuel={item.stock_actuel} min={item.stock_min} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(item)} className="p-2.5 sm:p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                          <button onClick={() => deleteItem(item.id)} className="p-2.5 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : (
            /* ── Vue cards ── */
            <div className="space-y-2">
              {filtered.map(item => {
                const open = expandedItemId === item.id;
                const stats = itemStats[item.id];
                return (
                  <div key={item.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <button onClick={() => toggleItemExpand(item.id)} className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 truncate">{item.nom}</p>
                            {item.categorie && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{item.categorie}</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            {item.supplier?.nom ?? '—'}
                            {item.conditionnement && <span>· {item.conditionnement}</span>}
                            {item.prix_moyen_pondere > 0 && <span>· {item.prix_moyen_pondere.toFixed(2)} MAD/{item.unite}</span>}
                          </p>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <StockBadge actuel={item.stock_actuel} min={item.stock_min} />
                          <button onClick={() => startEdit(item)} className="p-2.5 sm:p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                          <button onClick={() => deleteItem(item.id)} className="p-2.5 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StockBar actuel={item.stock_actuel} min={item.stock_min} />
                        <p className="text-sm font-bold text-gray-700 shrink-0">
                          {item.stock_actuel} <span className="text-gray-400 font-normal text-xs">{item.unite}</span>
                          <span className="text-gray-300 mx-1">/</span>
                          <span className="text-gray-400 font-normal text-xs">min {item.stock_min}</span>
                        </p>
                      </div>
                    </div>

                    {open && (
                      <div className="border-t border-gray-50 px-4 py-3">
                        {!stats ? (
                          <p className="text-xs text-gray-400 text-center py-2">Chargement des stats…</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center">
                              <p className="text-lg font-black text-gray-900">{stats.week.toFixed(1)}</p>
                              <p className="text-xs text-gray-400">{item.unite} / semaine</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-black text-gray-900">{stats.month.toFixed(1)}</p>
                              <p className="text-xs text-gray-400">{item.unite} / mois</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-black text-gray-900">{stats.year.toFixed(1)}</p>
                              <p className="text-xs text-gray-400">{item.unite} / an</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ ONGLET PF ═══════════════════════════════════════════════════════ */}
      {tab === 'pf' && (
        <>
          {/* Sélecteur entreprise */}
          {companies.length > 1 && (
            <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* Recherche + filtre inactifs */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={searchPf} onChange={e => setSearchPf(e.target.value)} placeholder="Rechercher…"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
            <button onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${showInactive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
              Inactifs
            </button>
          </div>

          {loadingPf ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : filteredPf.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Package className="text-gray-200 mx-auto mb-3" size={40} />
              <p className="text-gray-400 font-medium">Aucun produit fini</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPf.map(ref => {
                const activeArticles = (ref.articles || []).filter(a => a.is_active);
                const open = expandedPfId === ref.id;
                return (
                  <div key={ref.id} className={`bg-white rounded-2xl border overflow-hidden ${ref.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
                    <button onClick={() => setExpandedPfId(open ? null : ref.id)} className="w-full text-left px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-gray-400">{ref.code}</span>
                            <p className="font-semibold text-gray-900 truncate">{ref.name}</p>
                            {!ref.is_active && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inactif</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {ref.category?.nom && <span className="text-xs text-gray-400">{ref.category.nom}</span>}
                            {ref.atelier && <span className="text-xs text-gray-400">{ref.atelier}</span>}
                            <span className="text-xs text-gray-400">{ref.base_unit_price.toFixed(2)} MAD/{ref.base_unit}</span>
                            <span className="text-xs text-blue-600 font-medium">{activeArticles.length} déclinaison{activeArticles.length > 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        {open ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                      </div>
                    </button>

                    {open && (ref.articles || []).length > 0 && (
                      <div className="border-t border-gray-50 px-4 pb-3 pt-2 space-y-1">
                        {(ref.articles || []).map(art => (
                          <div key={art.id} className={`flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 ${!art.is_active ? 'opacity-40' : ''}`}>
                            <div>
                              <p className="text-sm text-gray-800">{art.display_name}</p>
                              <p className="text-xs text-gray-400">{art.pack_type} · {art.product_state}</p>
                            </div>
                            <p className="text-sm font-semibold text-gray-900 shrink-0">
                              {(art.custom_price ?? art.prix_pro ?? ref.base_unit_price * art.quantity).toFixed(2)} MAD
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
