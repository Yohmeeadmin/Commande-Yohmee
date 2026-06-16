'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, X, Package, Search, ChefHat, CheckCircle, AlertTriangle, ScanLine, ExternalLink, Info } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useAteliers } from '@/lib/useAteliers';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PFItem {
  id: string;
  nom: string;
  unite: string;
  stock_actuel: number;
  stock_min: number;
  quantite_reservee: number;
  atelier: string | null;
  product_reference_id: string | null;
}

interface ProductRef { id: string; name: string; }

interface Recipe {
  id: string; nom: string; rendement: number; atelier: string | null;
  product_reference_id: string | null;
  ingredients: {
    quantite: number;
    stock_item_id: string | null;
    stock_item: { id: string; nom: string; unite: string; stock_actuel: number } | null;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StockBadge({ actuel, min }: { actuel: number; min: number }) {
  if (actuel <= 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rupture</span>;
  if (actuel <= min) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Alerte</span>;
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">OK</span>;
}

// ─── Modal ajout PF ───────────────────────────────────────────────────────────

function ModalAjouterPF({ productRefs, ateliers, onClose, onSaved }: {
  productRefs: ProductRef[];
  ateliers: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nom, setNom]           = useState('');
  const [unite, setUnite]       = useState('pièce');
  const [stockMin, setStockMin] = useState('0');
  const [atelier, setAtelier]   = useState('');
  const [refId, setRefId]       = useState('');
  const [refSearch, setRefSearch] = useState('');
  const [saving, setSaving]     = useState(false);

  const filteredRefs = productRefs.filter(r => r.name.toLowerCase().includes(refSearch.toLowerCase()));
  const selectedRef  = productRefs.find(r => r.id === refId);

  async function save() {
    const finalNom = refId ? (selectedRef?.name ?? nom) : nom;
    if (!finalNom.trim()) return;
    setSaving(true);
    await supabase.from('stock_items').insert({
      nom: finalNom.trim(),
      unite: unite || 'pièce',
      stock_actuel: 0,
      stock_min: parseFloat(stockMin) || 0,
      item_type: 'pf',
      atelier: atelier || null,
      product_reference_id: refId || null,
      quantite_reservee: 0,
    });
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Nouveau produit fini</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Lien catalogue */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Lier au catalogue (optionnel)</label>
            {refId ? (
              <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-sm font-medium text-blue-800">{selectedRef?.name}</span>
                <button onClick={() => { setRefId(''); setRefSearch(''); setNom(''); }} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={refSearch} onChange={e => setRefSearch(e.target.value)}
                  placeholder="Rechercher dans le catalogue…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {refSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                    {filteredRefs.slice(0, 15).map(r => (
                      <button key={r.id} onClick={() => { setRefId(r.id); setNom(r.name); setRefSearch(''); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">{r.name}</button>
                    ))}
                    {filteredRefs.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Aucun résultat</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Nom */}
          {!refId && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Nom *</span>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Croissant beurre"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Unité</span>
              <select value={unite} onChange={e => setUnite(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['pièce', 'kg', 'plateau', 'boîte', 'sachet', 'portion'].map(u => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Stock min</span>
              <input type="number" min={0} value={stockMin} onChange={e => setStockMin(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Atelier</span>
            <select value={atelier} onChange={e => setAtelier(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Aucun</option>
              {ateliers.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={save} disabled={saving || (!refId && !nom.trim())}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {saving ? 'Création…' : 'Créer le produit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal entrée stock ───────────────────────────────────────────────────────

function ModalEntreeStock({ item, recipes, utilisateur, onClose, onSaved }: {
  item: PFItem;
  recipes: Recipe[];
  utilisateur: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab]         = useState<'manuel' | 'production'>('manuel');
  const [qty, setQty]         = useState('');
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);

  // Production
  const [recipeId, setRecipeId]   = useState('');
  const [qtyProd, setQtyProd]     = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');

  const recipe = recipes.find(r => r.id === recipeId);
  const facteur = recipe && parseFloat(qtyProd) > 0 ? parseFloat(qtyProd) / (recipe.rendement || 1) : 0;

  const consommations = recipe ? recipe.ingredients.map(ing => ({
    ...ing,
    qteADeduire: ing.quantite * facteur,
    suffisant: (ing.stock_item?.stock_actuel ?? 0) >= ing.quantite * facteur,
  })) : [];

  const canProduire = qtyProd && parseFloat(qtyProd) > 0 && recipeId && consommations.every(c => c.suffisant);

  async function saveManuel() {
    const q = parseFloat(qty);
    if (!q || q <= 0) return;
    setSaving(true);
    await supabase.from('stock_items').update({ stock_actuel: (item.stock_actuel || 0) + q }).eq('id', item.id);
    await supabase.from('stock_movements').insert({
      stock_item_id: item.id, type: 'entree_production',
      quantite: q, date, note: note || 'Entrée manuelle', utilisateur,
    });
    onSaved(); onClose();
  }

  async function saveProduction() {
    if (!recipe || !canProduire) return;
    const q = parseFloat(qtyProd);
    setSaving(true);

    // Déduire chaque MP
    for (const c of consommations) {
      if (!c.stock_item_id || c.qteADeduire <= 0) continue;
      const { data: si } = await supabase.from('stock_items').select('stock_actuel').eq('id', c.stock_item_id).single();
      if (!si) continue;
      const newStock = Math.max(0, (si.stock_actuel || 0) - c.qteADeduire);
      await supabase.from('stock_items').update({ stock_actuel: newStock }).eq('id', c.stock_item_id);
      await supabase.from('stock_movements').insert({
        stock_item_id: c.stock_item_id, type: 'production',
        quantite: -c.qteADeduire, date,
        note: `Production ${recipe.nom} × ${q}`, utilisateur,
      });
    }

    // Créditer le PF
    await supabase.from('stock_items').update({ stock_actuel: (item.stock_actuel || 0) + q }).eq('id', item.id);
    await supabase.from('stock_movements').insert({
      stock_item_id: item.id, type: 'entree_production',
      quantite: q, date, note: `Prod. ${recipe.nom} × ${q}`, utilisateur,
    });

    onSaved(); onClose();
  }

  const filteredRecipes = recipes.filter(r => r.nom.toLowerCase().includes(recipeSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Entrée stock</h2>
            <p className="text-sm text-gray-400">{item.nom}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-gray-100">
          <button onClick={() => setTab('manuel')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === 'manuel' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Manuel
          </button>
          <button onClick={() => setTab('production')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'production' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <ChefHat size={14} /> Depuis une recette
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === 'manuel' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">Quantité ({item.unite}) *</span>
                  <input type="number" min={0.01} step={0.01} value={qty} onChange={e => setQty(e.target.value)}
                    placeholder="0"
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">Date</span>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Note</span>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex : Fournée du matin"
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </>
          ) : (
            <>
              {/* Sélection recette */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Recette *</label>
                {recipeId && recipe ? (
                  <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-sm font-medium text-blue-800">{recipe.nom} <span className="text-xs text-blue-500">(rendement {recipe.rendement})</span></span>
                    <button onClick={() => { setRecipeId(''); setQtyProd(''); setRecipeSearch(''); }} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)}
                      placeholder="Rechercher une recette…"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {recipeSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                        {filteredRecipes.slice(0, 10).map(r => (
                          <button key={r.id} onClick={() => { setRecipeId(r.id); setRecipeSearch(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between">
                            <span>{r.nom}</span>
                            <span className="text-xs text-gray-400">{r.atelier || ''}</span>
                          </button>
                        ))}
                        {filteredRecipes.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Aucun résultat</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {recipeId && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">Quantité produite ({item.unite}) *</span>
                  <input type="number" min={1} step={1} value={qtyProd} onChange={e => setQtyProd(e.target.value)}
                    placeholder={`Ex : ${recipe?.rendement ?? 10}`}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
              )}

              {/* Aperçu consommation */}
              {facteur > 0 && consommations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                    <Info size={12} /> Matières premières consommées
                  </p>
                  {consommations.map((c, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${c.suffisant ? 'bg-gray-50' : 'bg-red-50 border border-red-200'}`}>
                      <span className={`font-medium ${c.suffisant ? 'text-gray-700' : 'text-red-700'}`}>
                        {c.stock_item?.nom ?? '—'}
                      </span>
                      <div className="text-right">
                        <span className={`font-bold ${c.suffisant ? 'text-gray-900' : 'text-red-600'}`}>
                          -{c.qteADeduire.toFixed(3)} {c.stock_item?.unite}
                        </span>
                        {!c.suffisant && (
                          <p className="text-xs text-red-500">Stock insuffisant ({c.stock_item?.stock_actuel ?? 0})</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {!canProduire && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> Stock insuffisant pour cette production</p>}
                </div>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Date</span>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={tab === 'manuel' ? saveManuel : saveProduction}
            disabled={saving || (tab === 'manuel' ? !qty || parseFloat(qty) <= 0 : !canProduire)}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? 'Enregistrement…' : (tab === 'production' ? <><ChefHat size={15} /> Confirmer la production</> : 'Valider l\'entrée')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ProduitsFinis() {
  const { profile } = useUser();
  const { ateliers } = useAteliers();

  const [items, setItems]           = useState<PFItem[]>([]);
  const [productRefs, setProductRefs] = useState<ProductRef[]>([]);
  const [recipes, setRecipes]       = useState<Recipe[]>([]);
  const [loading, setLoading]       = useState(true);

  const [filterAtelier, setFilterAtelier] = useState<string | null>(null);
  const [filterStock, setFilterStock]   = useState<'all' | 'en_stock' | 'rupture' | 'alerte'>('all');
  const [search, setSearch]         = useState('');

  // Édition inline seuil
  const [editingSeuilId, setEditingSeuilId]   = useState<string | null>(null);
  const [editingSeuilVal, setEditingSeuilVal] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [entreeItem, setEntreeItem] = useState<PFItem | null>(null);
  const [importing, setImporting]   = useState(false);

  // Inventaire
  const [inventaireMode, setInventaireMode] = useState(false);
  const [invLines, setInvLines]     = useState<{ id: string; nom: string; unite: string; theorique: number; reel: number }[]>([]);
  const [savingInv, setSavingInv]   = useState(false);
  const [invDone, setInvDone]       = useState(false);

  // Plan de production
  const [showPlan, setShowPlan]     = useState(false);
  const [planLines, setPlanLines]   = useState<{ pfId: string; recipeId: string; qty: number }[]>([]);
  const [savingPlan, setSavingPlan] = useState(false);

  const utilisateur = profile ? `${profile.first_name} ${profile.last_name}` : '';

  useEffect(() => { load().then(() => syncPF(true)); }, []);

  async function load() {
    const { data: fullData } = await supabase
      .from('stock_items')
      .select('id, nom, unite, stock_actuel, stock_min, quantite_reservee, atelier, product_reference_id')
      .eq('item_type', 'pf')
      .order('nom');

    const pfData = (fullData as PFItem[]) || [];

    const [{ data: refs }, { data: rec }] = await Promise.all([
      supabase.from('product_references').select('id, name').order('name'),
      supabase.from('recipe_sheets')
        .select('id, nom, rendement, atelier, product_reference_id, ingredients:recipe_ingredients!recipe_sheet_id(quantite, stock_item_id, stock_item:stock_items(id, nom, unite, stock_actuel))')
        .eq('type', 'recette'),
    ]);

    setItems(pfData || []);
    setProductRefs((refs as ProductRef[]) || []);
    setRecipes((rec as Recipe[]) || []);
    setLoading(false);
  }

  // Ateliers utilisés dans les PF
  const usedAteliers = useMemo(() => {
    const set = new Set(items.map(i => i.atelier).filter(Boolean) as string[]);
    return [...set];
  }, [items]);

  const displayed = useMemo(() => items.filter(i => {
    const matchAtelier = filterAtelier === null || i.atelier === filterAtelier;
    const matchSearch = !search || i.nom.toLowerCase().includes(search.toLowerCase());
    const matchStock =
      filterStock === 'all' ? true :
      filterStock === 'en_stock' ? i.stock_actuel > 0 :
      filterStock === 'rupture' ? i.stock_actuel <= 0 :
      /* alerte */ i.stock_actuel > 0 && i.stock_min > 0 && i.stock_actuel <= i.stock_min;
    return matchAtelier && matchSearch && matchStock;
  }), [items, filterAtelier, search, filterStock]);

  async function saveSeuilInline(id: string) {
    const v = Math.max(0, parseFloat(editingSeuilVal) || 0);
    await supabase.from('stock_items').update({ stock_min: v }).eq('id', id);
    setItems(p => p.map(i => i.id === id ? { ...i, stock_min: v } : i));
    setEditingSeuilId(null);
  }

  // Plan de production — computed values
  const planWithData = useMemo(() => planLines.map(line => {
    const pf = items.find(i => i.id === line.pfId);
    const recipe = recipes.find(r => r.id === line.recipeId);
    return { ...line, pf, recipe };
  }), [planLines, items, recipes]);

  const mpNeeds = useMemo(() => {
    const needs: Record<string, { stock_item_id: string; nom: string; unite: string; needed: number; available: number }> = {};
    for (const line of planWithData) {
      if (!line.recipe || line.qty <= 0) continue;
      const facteur = line.qty / (line.recipe.rendement || 1);
      for (const ing of line.recipe.ingredients) {
        if (!ing.stock_item_id || !ing.stock_item) continue;
        if (!needs[ing.stock_item_id]) {
          needs[ing.stock_item_id] = {
            stock_item_id: ing.stock_item_id,
            nom: ing.stock_item.nom,
            unite: ing.stock_item.unite,
            needed: 0,
            available: ing.stock_item.stock_actuel,
          };
        }
        needs[ing.stock_item_id].needed += ing.quantite * facteur;
      }
    }
    return Object.values(needs);
  }, [planWithData]);

  const enStock   = items.filter(i => i.stock_actuel > 0).length;
  const enRupture = items.filter(i => i.stock_actuel <= 0).length;
  const enAlerte  = items.filter(i => i.stock_actuel > 0 && i.stock_actuel <= i.stock_min).length;
  const totalReserve = items.reduce((s, i) => s + (i.quantite_reservee || 0), 0);

  // ─── Import catalogue ────────────────────────────────────────────────────

  // silent=true : sync auto au chargement sans confirm ni alert
  async function syncPF(silent = false) {
    if (!silent) {
      if (!confirm('Synchroniser les produits finis depuis le catalogue ?')) return;
    }
    if (!silent) setImporting(true);

    // 1. Références du catalogue
    const companyId = typeof window !== 'undefined' ? localStorage.getItem('catalogue_company_id') : null;
    let finalRefs: any[] | null = null;
    if (companyId) {
      const { data } = await (supabase.from('product_references').select('id, name, atelier').eq('is_active', true) as any).eq('company_id', companyId);
      if (data && data.length > 0) finalRefs = data;
    }
    if (!finalRefs) {
      const { data } = await supabase.from('product_references').select('id, name, atelier').eq('is_active', true);
      if (data && data.length > 0) finalRefs = data;
    }
    if (!finalRefs || finalRefs.length === 0) {
      if (!silent) setImporting(false);
      return;
    }

    const refMap = new Map(finalRefs.map((r: any) => [r.id, r]));
    const refIds = finalRefs.map((r: any) => r.id);

    // 2. Articles du catalogue
    const { data: articles } = await supabase
      .from('product_articles')
      .select('id, display_name, product_reference_id')
      .in('product_reference_id', refIds)
      .eq('is_active', true);

    if (!articles || articles.length === 0) {
      if (!silent) setImporting(false);
      return;
    }

    // display_name contient déjà le nom complet (ex: "Baguette complete - lot 5 - pré-cuit")
    // Pour une référence sans articles ou avec 1 seul article → utiliser ref.name
    const articlesByRef: Record<string, any[]> = {};
    (articles as any[]).forEach(a => {
      if (!articlesByRef[a.product_reference_id]) articlesByRef[a.product_reference_id] = [];
      articlesByRef[a.product_reference_id].push(a);
    });

    const articlesWithName = (articles as any[]).map(a => {
      const ref = refMap.get(a.product_reference_id);
      if (!ref) return null;
      const siblings = articlesByRef[a.product_reference_id] || [];
      // 1 seul article → nom de la référence ; plusieurs → display_name (déjà complet)
      const nom = siblings.length === 1 ? ref.name : a.display_name;
      return { ...a, reference: ref, nom };
    }).filter(Boolean) as any[];

    // 3. Supprimer TOUS les PF importés depuis le catalogue (product_reference_id non null)
    //    pour repartir sur une base propre à chaque sync
    const { data: existingPF } = await supabase
      .from('stock_items')
      .select('id, stock_actuel')
      .eq('item_type', 'pf')
      .not('product_reference_id', 'is', null);

    // Ne supprimer que ceux qui ont stock = 0 (sécurité : garder ceux qui ont du stock réel)
    const toDelete = (existingPF || []).filter((p: { stock_actuel: number | null; id: string }) => (p.stock_actuel ?? 0) === 0).map((p: { id: string }) => p.id);
    if (toDelete.length > 0) await supabase.from('stock_items').delete().in('id', toDelete);

    // PF encore présents (stock > 0, on ne touche pas)
    const { data: remaining } = await supabase
      .from('stock_items').select('nom').eq('item_type', 'pf');
    const existingNames = new Set((remaining || []).map((p: { nom: string }) => p.nom.toLowerCase().trim()));

    // 4. Créer tous les articles manquants
    const toCreate = articlesWithName.filter(a => !existingNames.has(a.nom.toLowerCase().trim()));

    if (toCreate.length > 0) {
      const rows = toCreate.map((a: any) => ({
        nom: a.nom,
        unite: 'pièce',
        stock_actuel: 0,
        stock_min: 0,
        prix_moyen_pondere: 0,
        poids_conditionnement: 0,
        prix_achat: 0,
        item_type: 'pf',
        atelier: a.reference.atelier ?? null,
        product_reference_id: a.product_reference_id,
        quantite_reservee: 0,
      }));
      const { error } = await supabase.from('stock_items').insert(rows);
      if (error && !silent) alert(`Erreur sync : ${error.message}`);
    }

    await load();
    if (!silent) setImporting(false);
  }

  async function importerDepuisCatalogue() {
    await syncPF(false);
  }

  // ─── Plan de production ──────────────────────────────────────────────────

  function openPlan() {
    const underSeuil = items.filter(i => i.stock_min > 0 && i.stock_actuel < i.stock_min);
    if (underSeuil.length === 0) { setShowPlan(true); setPlanLines([]); return; }
    const lines = underSeuil.map(pf => {
      const match =
        (pf.product_reference_id ? recipes.find(r => r.product_reference_id === pf.product_reference_id) : null) ??
        recipes.find(r =>
          r.nom.toLowerCase().includes(pf.nom.toLowerCase()) ||
          pf.nom.toLowerCase().includes(r.nom.toLowerCase())
        );
      return { pfId: pf.id, recipeId: match?.id || '', qty: Math.max(1, pf.stock_min - pf.stock_actuel) };
    });
    setPlanLines(lines);
    setShowPlan(true);
  }

  function canProduceLine(line: typeof planWithData[0]): boolean {
    if (!line.recipe || line.qty <= 0) return false;
    const facteur = line.qty / (line.recipe.rendement || 1);
    return line.recipe.ingredients.every(ing =>
      !ing.stock_item_id || (ing.stock_item?.stock_actuel ?? 0) >= ing.quantite * facteur
    );
  }

  async function lancerProductions() {
    const date = new Date().toISOString().slice(0, 10);
    const valid = planWithData.filter(l => l.pf && l.recipe && l.qty > 0);
    setSavingPlan(true);
    const runningStock: Record<string, number> = {};
    for (const line of valid) {
      if (!line.pf || !line.recipe) continue;
      const facteur = line.qty / (line.recipe.rendement || 1);
      for (const ing of line.recipe.ingredients) {
        if (!ing.stock_item_id || ing.quantite <= 0) continue;
        const qte = ing.quantite * facteur;
        if (runningStock[ing.stock_item_id] === undefined) {
          runningStock[ing.stock_item_id] = ing.stock_item?.stock_actuel ?? 0;
        }
        const newStock = Math.max(0, runningStock[ing.stock_item_id] - qte);
        await supabase.from('stock_items').update({ stock_actuel: newStock }).eq('id', ing.stock_item_id);
        await supabase.from('stock_movements').insert({
          stock_item_id: ing.stock_item_id, type: 'production',
          quantite: -qte, date,
          note: `Plan prod. ${line.recipe.nom} × ${line.qty}`, utilisateur,
        });
        runningStock[ing.stock_item_id] = newStock;
      }
      await supabase.from('stock_items').update({ stock_actuel: (line.pf.stock_actuel || 0) + line.qty }).eq('id', line.pf.id);
      await supabase.from('stock_movements').insert({
        stock_item_id: line.pf.id, type: 'entree_production',
        quantite: line.qty, date,
        note: `Plan prod. ${line.recipe.nom} × ${line.qty}`, utilisateur,
      });
    }
    setSavingPlan(false);
    setShowPlan(false);
    await load();
  }

  // ─── Inventaire ──────────────────────────────────────────────────────────

  function startInventaire() {
    const src = filterAtelier ? items.filter(i => i.atelier === filterAtelier) : displayed;
    setInvLines(src.map(i => ({ id: i.id, nom: i.nom, unite: i.unite, theorique: i.stock_actuel, reel: i.stock_actuel })));
    setInventaireMode(true);
    setInvDone(false);
  }

  async function validerInventaire() {
    const ecarts = invLines.filter(l => l.reel !== l.theorique);
    if (!confirm(`Valider l'inventaire ? ${ecarts.length} écart(s) seront corrigés.`)) return;
    setSavingInv(true);
    const date = new Date().toISOString().slice(0, 10);
    for (const line of ecarts) {
      const diff = line.reel - line.theorique;
      await supabase.from('stock_items').update({ stock_actuel: line.reel }).eq('id', line.id);
      await supabase.from('stock_movements').insert({
        stock_item_id: line.id, type: 'inventaire',
        quantite: diff, date, utilisateur,
        note: `Inventaire PF — théorique: ${line.theorique}, réel: ${line.reel}`,
      });
    }
    setSavingInv(false);
    setInventaireMode(false);
    setInvDone(true);
    await load();
  }

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Produits finis</h1>
          <p className="text-sm text-gray-400">{items.length} référence{items.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {!inventaireMode && (
            <>
              <button onClick={openPlan}
                className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-sm font-medium hover:bg-orange-100">
                <ChefHat size={14} /> Plan de production
                {items.filter(i => i.stock_min > 0 && i.stock_actuel < i.stock_min).length > 0 && (
                  <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {items.filter(i => i.stock_min > 0 && i.stock_actuel < i.stock_min).length}
                  </span>
                )}
              </button>
              <button onClick={startInventaire} disabled={items.length === 0}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                <ScanLine size={14} /> Inventaire{filterAtelier ? ` — ${filterAtelier}` : ''}
              </button>
              <button onClick={importerDepuisCatalogue} disabled={importing}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-100 disabled:opacity-40">
                {importing ? 'Import en cours…' : '↓ Importer depuis le catalogue'}
              </button>
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                <Plus size={14} /> Ajouter
              </button>
            </>
          )}
        </div>
      </div>

      {/* Onglets ateliers */}
      {usedAteliers.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <button onClick={() => setFilterAtelier(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterAtelier === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Tous
          </button>
          {usedAteliers.map(a => (
            <button key={a} onClick={() => setFilterAtelier(filterAtelier === a ? null : a)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterAtelier === a ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {a}
            </button>
          ))}
        </div>
      )}

      {/* Stats + filtres stock */}
      <div className="grid grid-cols-4 gap-3">
        <button onClick={() => setFilterStock(filterStock === 'en_stock' ? 'all' : 'en_stock')}
          className={`rounded-2xl border px-4 py-3 text-left transition-all ${filterStock === 'en_stock' ? 'bg-green-50 border-green-300' : 'bg-white border-gray-100 hover:border-green-200'}`}>
          <p className="text-xl font-black text-green-600">{enStock}</p>
          <p className="text-xs text-gray-400 mt-0.5">En stock</p>
        </button>
        <button onClick={() => setFilterStock(filterStock === 'rupture' ? 'all' : 'rupture')}
          className={`rounded-2xl border px-4 py-3 text-left transition-all ${filterStock === 'rupture' ? 'bg-red-50 border-red-300' : 'bg-white border-gray-100 hover:border-red-200'}`}>
          <p className={`text-xl font-black ${enRupture > 0 ? 'text-red-600' : 'text-gray-300'}`}>{enRupture}</p>
          <p className="text-xs text-gray-400 mt-0.5">Rupture</p>
        </button>
        <button onClick={() => setFilterStock(filterStock === 'alerte' ? 'all' : 'alerte')}
          className={`rounded-2xl border px-4 py-3 text-left transition-all ${filterStock === 'alerte' ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-100 hover:border-orange-200'}`}>
          <p className={`text-xl font-black ${enAlerte > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{enAlerte}</p>
          <p className="text-xs text-gray-400 mt-0.5">Alerte seuil</p>
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <p className="text-xl font-black text-blue-600">{totalReserve}</p>
          <p className="text-xs text-gray-400 mt-0.5">Réservé</p>
        </div>
      </div>

      {/* Plan de production */}
      {showPlan && (
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-orange-100 bg-orange-50">
            <h2 className="font-bold text-orange-900 flex items-center gap-2"><ChefHat size={16} /> Plan de production</h2>
            <button onClick={() => setShowPlan(false)} className="p-1.5 hover:bg-orange-100 rounded-lg"><X size={18} className="text-orange-500" /></button>
          </div>

          <div className="px-5 py-4 space-y-3">
            {planLines.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Tous les produits sont au-dessus du seuil</p>
            ) : (
              <>
                {planWithData.map((line, idx) => {
                  const ok = canProduceLine(line);
                  return (
                    <div key={line.pfId} className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      {/* Infos PF */}
                      <div className="flex-1 min-w-[140px]">
                        <p className="font-semibold text-gray-900 text-sm">{line.pf?.nom ?? '—'}</p>
                        <p className="text-xs text-gray-400">Stock : {line.pf?.stock_actuel ?? 0} | Seuil : {line.pf?.stock_min ?? 0} {line.pf?.unite}</p>
                      </div>

                      {/* Recette liée */}
                      {line.recipeId ? (
                        <p className="text-xs text-gray-500 flex-1 min-w-[160px] truncate italic">{line.recipe?.nom ?? ''}</p>
                      ) : (
                        <Link href="/recettes"
                          className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-orange-300 text-orange-600 rounded-xl text-xs font-medium hover:bg-orange-50 transition-colors flex-1 min-w-[160px] justify-center">
                          <ExternalLink size={12} /> Ajouter la recette
                        </Link>
                      )}

                      {/* Quantité */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setPlanLines(p => p.map((l, i) => i === idx ? { ...l, qty: Math.max(1, l.qty - 1) } : l))}
                          className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300 text-sm font-bold">−</button>
                        <input
                          type="number" min={1} step={1} value={line.qty}
                          onChange={e => setPlanLines(p => p.map((l, i) => i === idx ? { ...l, qty: Math.max(1, parseInt(e.target.value) || 1) } : l))}
                          className="w-16 text-center font-bold text-gray-900 border border-gray-200 rounded-xl py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                        <button
                          onClick={() => setPlanLines(p => p.map((l, i) => i === idx ? { ...l, qty: l.qty + 1 } : l))}
                          className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 text-sm font-bold">+</button>
                        <span className="text-xs text-gray-400">{line.pf?.unite}</span>
                      </div>

                      {/* Statut */}
                      {line.recipeId && line.qty > 0 && (
                        ok
                          ? <span className="text-green-600 font-bold text-sm shrink-0">✓</span>
                          : <span className="text-red-500 font-bold text-sm shrink-0" title="Stock MP insuffisant">✗</span>
                      )}
                    </div>
                  );
                })}

                {/* Résumé MP */}
                {mpNeeds.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Matières premières nécessaires</p>
                    {[...mpNeeds].sort((a, b) => (a.needed > a.available ? 1 : -1) - (b.needed > b.available ? 1 : -1)).map(mp => {
                      const sufficient = mp.available >= mp.needed;
                      return (
                        <div key={mp.stock_item_id} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${sufficient ? 'bg-gray-50' : 'bg-red-50 border border-red-200'}`}>
                          <span className={`font-medium ${sufficient ? 'text-gray-700' : 'text-red-700'}`}>{mp.nom}</span>
                          <div className="flex items-center gap-2 text-right">
                            <span className={`tabular-nums text-xs ${sufficient ? 'text-gray-500' : 'text-red-600'}`}>
                              Besoin : {mp.needed.toFixed(2)} {mp.unite} / Dispo : {mp.available.toFixed(2)}
                            </span>
                            {sufficient
                              ? <span className="text-green-600 font-bold">✓</span>
                              : <span className="text-red-500 font-bold" title={`Manque ${(mp.needed - mp.available).toFixed(2)} ${mp.unite}`}>✗ -{(mp.needed - mp.available).toFixed(2)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {planLines.length > 0 && (() => {
            const launchable = planWithData.filter(l => l.pf && l.recipe && l.qty > 0 && canProduceLine(l));
            const blocked = planWithData.filter(l => l.pf && l.recipe && l.qty > 0 && !canProduceLine(l));
            return (
              <div className="px-5 py-4 border-t border-orange-100 bg-orange-50 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-orange-700">{launchable.length}</span> production(s) prête(s) à lancer
                  {blocked.length > 0 && (
                    <span className="ml-2 flex items-center gap-1 text-orange-500 text-xs font-medium inline-flex">
                      <AlertTriangle size={12} /> {blocked.length} bloquée(s) (MP insuffisants)
                    </span>
                  )}
                </div>
                <button
                  onClick={lancerProductions}
                  disabled={launchable.length === 0 || savingPlan}
                  className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 disabled:opacity-40">
                  <ChefHat size={14} /> {savingPlan ? 'Lancement…' : `Lancer ${launchable.length} production(s)`}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Succès inventaire */}
      {invDone && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CheckCircle size={18} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-700 font-medium">Inventaire validé avec succès.</p>
        </div>
      )}

      {/* Mode inventaire */}
      {inventaireMode && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <p className="text-sm text-blue-700 font-medium flex items-center gap-2">
              <ScanLine size={14} /> Mode inventaire{filterAtelier ? ` — ${filterAtelier}` : ''} — {invLines.filter(l => l.reel !== l.theorique).length} écart(s)
            </p>
            <button onClick={() => setInventaireMode(false)} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
          </div>
          <div className="space-y-2">
            {invLines.map(line => {
              const ecart = line.reel - line.theorique;
              return (
                <div key={line.id} className={`bg-white rounded-2xl border px-4 py-3 ${ecart !== 0 ? 'border-orange-200' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{line.nom}</p>
                      <p className="text-xs text-gray-400">Théorique : {line.theorique} {line.unite}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setInvLines(p => p.map(l => l.id === line.id ? { ...l, reel: Math.max(0, l.reel - 1) } : l))}
                        className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200">−</button>
                      <input type="number" min={0} step={1} value={line.reel}
                        onChange={e => setInvLines(p => p.map(l => l.id === line.id ? { ...l, reel: parseFloat(e.target.value) || 0 } : l))}
                        className="w-20 text-center font-bold text-gray-900 border border-gray-200 rounded-xl py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button onClick={() => setInvLines(p => p.map(l => l.id === line.id ? { ...l, reel: l.reel + 1 } : l))}
                        className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700">+</button>
                    </div>
                  </div>
                  {ecart !== 0 && (
                    <p className={`text-xs mt-1 font-medium ${ecart > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Écart : {ecart > 0 ? '+' : ''}{ecart} {line.unite}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setInventaireMode(false)} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-medium">Annuler</button>
            <button onClick={validerInventaire} disabled={savingInv}
              className="flex-1 py-3 bg-green-600 text-white rounded-2xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              <CheckCircle size={16} /> {savingInv ? 'Validation…' : `Valider (${invLines.filter(l => l.reel !== l.theorique).length} écarts)`}
            </button>
          </div>
        </>
      )}

      {/* Recherche */}
      {!inventaireMode && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un produit…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
      )}

      {/* Liste */}
      {!inventaireMode && (displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun produit fini</p>
          <button onClick={() => setShowAddModal(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={14} /> Ajouter un produit
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Produit</th>
                <th className="text-right px-4 py-3">Actuel</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell text-blue-500">Réservé</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell text-green-600">Disponible</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Seuil min</th>
                <th className="text-center px-4 py-3">État</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayed.map(item => {
                const disponible = (item.stock_actuel || 0) - (item.quantite_reservee || 0);
                return (
                  <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-900">{item.nom}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {item.atelier && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">{item.atelier}</span>}
                        {item.product_reference_id && <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">Catalogue</span>}
                        <span className="text-xs text-gray-400">{item.unite}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{item.stock_actuel}</td>
                    <td className="px-4 py-2.5 text-right text-blue-500 font-medium tabular-nums hidden sm:table-cell">
                      {item.quantite_reservee > 0 ? `-${item.quantite_reservee}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums hidden sm:table-cell">
                      <span className={disponible < 0 ? 'text-red-600' : disponible === 0 ? 'text-gray-400' : 'text-green-600'}>
                        {disponible}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right hidden md:table-cell">
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
                          onClick={() => { setEditingSeuilId(item.id); setEditingSeuilVal(String(item.stock_min ?? 0)); }}
                          className={`tabular-nums text-sm rounded px-1 hover:bg-blue-50 hover:text-blue-600 transition-colors ${item.stock_min > 0 ? 'text-gray-400' : 'text-gray-200'}`}
                          title="Cliquer pour modifier le seuil">
                          {item.stock_min > 0 ? item.stock_min : '+ seuil'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StockBadge actuel={item.stock_actuel} min={item.stock_min} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setEntreeItem(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors ml-auto">
                        <Plus size={12} /> Entrée
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Modals */}
      {showAddModal && (
        <ModalAjouterPF productRefs={productRefs} ateliers={ateliers} onClose={() => setShowAddModal(false)} onSaved={load} />
      )}
      {entreeItem && (
        <ModalEntreeStock item={entreeItem} recipes={recipes} utilisateur={utilisateur} onClose={() => setEntreeItem(null)} onSaved={load} />
      )}
    </div>
  );
}
