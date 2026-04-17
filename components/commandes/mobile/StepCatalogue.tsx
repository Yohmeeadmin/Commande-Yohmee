'use client';

import { useState, useMemo, useRef } from 'react';
import { Search, ShoppingCart, ChevronLeft, Plus, Check, X, ChevronDown } from 'lucide-react';
import { Client, Category, calculateArticlePrice, getProductStateStyle, PACK_TYPES, generateArticleDisplayName } from '@/types';
import { ArticleWithRef, OrderLine } from './types';
import { formatPrice } from '@/lib/utils';
import { useAteliers } from '@/lib/useAteliers';
import { supabase } from '@/lib/supabase/client';
import ArticleSheet from './ArticleSheet';

interface ProductGroup {
  refId: string;
  refName: string;
  refCode: string;
  categoryId: string | null;
  articles: ArticleWithRef[];
}

interface Props {
  client: Client;
  categories: Category[];
  articles: ArticleWithRef[];
  lines: OrderLine[];
  onAdd: (article: ArticleWithRef) => void;
  onArticleCreated: (article: ArticleWithRef) => void;
  onBack: () => void;
  onOpenCart: () => void;
}

export default function StepCatalogue({
  client, categories, articles, lines, onAdd, onArticleCreated, onBack, onOpenCart,
}: Props) {
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');
  const [sheetRef, setSheetRef] = useState<string | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { ateliers } = useAteliers();

  const totalItems = lines.reduce((s, l) => s + l.quantite, 0);
  const totalPrice = lines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

  // Grouper les articles par référence produit
  const productGroups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    articles.forEach(a => {
      const refId = a.product_reference_id;
      if (!map.has(refId)) {
        map.set(refId, {
          refId,
          refName: a.product_reference.name,
          refCode: a.product_reference.code,
          categoryId: a.product_reference.category_id,
          articles: [],
        });
      }
      map.get(refId)!.articles.push(a);
    });
    return Array.from(map.values());
  }, [articles]);

  // Articles fréquents basés sur l'historique (passés via lines pré-rempli au reorder)
  const frequentArticleIds = useMemo(() => {
    const ids = new Set(lines.map(l => l.article_id));
    return ids;
  }, [lines]);

  const frequentGroups = useMemo(() =>
    productGroups.filter(g => g.articles.some(a => frequentArticleIds.has(a.id))),
    [productGroups, frequentArticleIds]
  );

  // Filtrage par catégorie + recherche
  const filteredGroups = useMemo(() => {
    return productGroups.filter(g => {
      const matchCat = activeCat === 'all' || g.categoryId === activeCat;
      const matchSearch = !search ||
        g.refName.toLowerCase().includes(search.toLowerCase()) ||
        g.refCode.toLowerCase().includes(search.toLowerCase()) ||
        g.articles.some(a => a.display_name.toLowerCase().includes(search.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [productGroups, activeCat, search]);

  const sheetArticles = useMemo(() =>
    sheetRef ? (productGroups.find(g => g.refId === sheetRef)?.articles ?? []) : [],
    [sheetRef, productGroups]
  );

  function getLineQty(articleId: string) {
    return lines.find(l => l.article_id === articleId)?.quantite ?? 0;
  }

  function handleGroupTap(group: ProductGroup) {
    if (group.articles.length === 1) {
      onAdd(group.articles[0]);
    } else {
      setSheetRef(group.refId);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header sticky */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{client.nom}</p>
            <p className="text-xs text-gray-400">Choisir les articles</p>
          </div>
          <button
            onClick={() => setShowQuickCreate(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white"
            title="Créer un article"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Recherche */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none text-sm"
            />
          </div>
        </div>

        {/* Catégories */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
          <button
            onClick={() => setActiveCat('all')}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors
              ${activeCat === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Tout
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors
                ${activeCat === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {cat.nom}
            </button>
          ))}
        </div>
      </div>

      {/* Liste produits */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '6rem' }}>

        {/* Section "Habituellement commandé" */}
        {frequentGroups.length > 0 && !search && activeCat === 'all' && (
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Habituellement commandé
            </p>
            <div className="space-y-2">
              {frequentGroups.map(group => (
                <ProductRow
                  key={group.refId}
                  group={group}
                  lines={lines}
                  getLineQty={getLineQty}
                  onTap={handleGroupTap}
                  highlighted
                />
              ))}
            </div>
            <div className="mt-4 mb-1 border-t border-gray-100" />
          </div>
        )}

        {/* Tous les produits */}
        <div className="px-4 pt-2 space-y-2">
          {filteredGroups.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">Aucun produit trouvé</p>
            </div>
          )}
          {filteredGroups.map(group => (
            <ProductRow
              key={group.refId}
              group={group}
              lines={lines}
              getLineQty={getLineQty}
              onTap={handleGroupTap}
            />
          ))}
        </div>
      </div>

      {/* Barre panier sticky */}
      {totalItems > 0 && (
        <button
          onClick={onOpenCart}
          className="fixed left-0 right-0 mx-4 flex items-center justify-between px-5 py-4 bg-blue-600 text-white rounded-2xl shadow-lg active:scale-98 transition-transform z-30"
          style={{ bottom: 'calc(56px + 1rem)' }}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart size={22} />
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-white text-blue-600 rounded-full text-[10px] font-black flex items-center justify-center">
                {totalItems}
              </span>
            </div>
            <span className="font-bold">Voir le panier</span>
          </div>
          <span className="font-black text-lg">{formatPrice(totalPrice)}</span>
        </button>
      )}

      {/* Article bottom sheet */}
      {sheetRef && (
        <ArticleSheet
          articles={sheetArticles}
          lines={lines}
          onAdd={onAdd}
          onClose={() => setSheetRef(null)}
        />
      )}

      {/* Création rapide d'article */}
      {showQuickCreate && (
        <QuickArticleSheet
          ateliers={ateliers}
          onClose={() => setShowQuickCreate(false)}
          onCreated={article => {
            onArticleCreated(article);
            onAdd(article);
            setShowQuickCreate(false);
          }}
        />
      )}
    </div>
  );
}

// ─── ProductRow ───────────────────────────────────────────
function ProductRow({
  group, lines, getLineQty, onTap, highlighted = false,
}: {
  group: ProductGroup;
  lines: OrderLine[];
  getLineQty: (id: string) => number;
  onTap: (group: ProductGroup) => void;
  highlighted?: boolean;
}) {
  const singleArticle = group.articles.length === 1 ? group.articles[0] : null;
  const price = singleArticle
    ? calculateArticlePrice(singleArticle, singleArticle.product_reference)
    : null;
  const packLabel = singleArticle
    ? PACK_TYPES.find(p => p.value === singleArticle.pack_type)?.label
    : null;
  const stateStyle = singleArticle ? getProductStateStyle(singleArticle.product_state) : null;
  const qty = singleArticle ? getLineQty(singleArticle.id) : 0;
  const totalQtyMulti = group.articles.length > 1
    ? group.articles.reduce((s, a) => s + getLineQty(a.id), 0)
    : 0;
  const inCart = qty > 0 || totalQtyMulti > 0;

  return (
    <button
      onClick={() => onTap(group)}
      className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-98 text-left
        ${inCart
          ? 'border-blue-200 bg-blue-50'
          : highlighted
            ? 'border-gray-200 bg-white'
            : 'border-gray-100 bg-white hover:border-gray-200'
        }`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{group.refName}</p>
        {singleArticle && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {packLabel && (
              <span className="text-xs text-gray-500">{packLabel} {singleArticle.quantity}</span>
            )}
            {stateStyle && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}
              >
                {stateStyle.label}
              </span>
            )}
          </div>
        )}
        {group.articles.length > 1 && (
          <p className="text-xs text-gray-400 mt-1">{group.articles.length} formats disponibles</p>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {price !== null && (
          <span className="font-semibold text-gray-700 text-sm">{formatPrice(price)}</span>
        )}

        {/* Bouton + ou compteur */}
        {singleArticle ? (
          qty > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-8 flex items-center justify-center bg-blue-600 rounded-full text-white font-bold text-sm">
                {qty}
              </div>
              <Check size={16} className="text-blue-600" />
            </div>
          ) : (
            <div className="w-9 h-9 flex items-center justify-center bg-blue-600 rounded-full text-white font-bold text-xl">
              <Plus size={18} />
            </div>
          )
        ) : (
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold
            ${totalQtyMulti > 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {totalQtyMulti > 0 ? `×${totalQtyMulti}` : 'Choisir'}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── QuickArticleSheet ──────────────────────────────────────────────────────
const TVA_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5.5', label: '5,5%' },
  { value: '10', label: '10%' },
  { value: '20', label: '20%' },
];

function QuickArticleSheet({
  ateliers,
  onClose,
  onCreated,
}: {
  ateliers: { value: string; label: string; color: string; bg_color: string }[];
  onClose: () => void;
  onCreated: (article: ArticleWithRef) => void;
}) {
  const [name, setName] = useState('');
  const [atelier, setAtelier] = useState(ateliers[0]?.value ?? '');
  const [price, setPrice] = useState('');
  const [tva, setTva] = useState('20');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim() || !price) { setError('Nom et prix requis'); return; }
    setSaving(true);
    setError('');
    try {
      // Générer un code unique
      const slug = name.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        .slice(0, 20);
      const code = `${slug}-${Date.now().toString(36)}`;

      // Créer la référence
      const { data: ref, error: refErr } = await supabase
        .from('product_references')
        .insert({
          code,
          name: name.trim(),
          atelier: atelier || 'boulangerie',
          base_unit: 'pièce',
          base_unit_price: parseFloat(price) || 0,
          vat_rate: parseFloat(tva) || 20,
          is_active: true,
        })
        .select()
        .single();

      if (refErr) throw refErr;

      // Créer l'article
      const displayName = generateArticleDisplayName(ref.code, ref.name, 'unite', 1, 'frais');
      const { data: article, error: artErr } = await supabase
        .from('product_articles')
        .insert({
          product_reference_id: ref.id,
          pack_type: 'unite',
          quantity: 1,
          product_state: 'frais',
          is_active: true,
          display_name: displayName,
        })
        .select()
        .single();

      if (artErr) throw artErr;

      // Construire l'ArticleWithRef
      const articleWithRef: ArticleWithRef = {
        ...article,
        product_reference: ref,
      };

      onCreated(articleWithRef);
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 24px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Nouvel article</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Nom */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Nom de l'article *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Baguette tradition"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Atelier */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Atelier
            </label>
            <div className="relative">
              <select
                value={atelier}
                onChange={e => setAtelier(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
              >
                {ateliers.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Prix + TVA */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                Prix unitaire (€) *
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-28">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                TVA
              </label>
              <div className="relative">
                <select
                  value={tva}
                  onChange={e => setTva(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
                >
                  {TVA_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !price}
            className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Création...' : 'Créer et ajouter au panier'}
          </button>
        </div>
      </div>
    </>
  );
}
