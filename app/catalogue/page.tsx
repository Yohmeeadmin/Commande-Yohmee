'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Package, ChevronDown, ChevronRight, Edit2, Archive, Layers, Table2, Settings, X, Trash2, ChevronUp, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  ProductReference,
  ProductArticle,
  Category,
  PACK_TYPES,
  calculateArticlePrice,
  getProductStateStyle
} from '@/types';
import { formatPrice } from '@/lib/utils';
import { useAteliers, refreshAteliers, AtelierDB } from '@/lib/useAteliers';

const COLOR_PRESETS = [
  { label: 'Brun/Jaune', color: '#92400E', bgColor: '#FEF3C7' },
  { label: 'Rose', color: '#BE185D', bgColor: '#FCE7F3' },
  { label: 'Orange', color: '#78350F', bgColor: '#FED7AA' },
  { label: 'Vert', color: '#065F46', bgColor: '#D1FAE5' },
  { label: 'Bleu', color: '#1D4ED8', bgColor: '#EFF6FF' },
  { label: 'Violet', color: '#7E22CE', bgColor: '#F5F3FF' },
  { label: 'Rouge', color: '#B91C1C', bgColor: '#FEE2E2' },
  { label: 'Gris', color: '#6B7280', bgColor: '#F3F4F6' },
];

export default function CataloguePage() {
  const [references, setReferences] = useState<(ProductReference & { articles: ProductArticle[] })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const { ateliers, getStyle: getAtelierStyle } = useAteliers();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAtelier, setSelectedAtelier] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'cards' | 'tableau'>('cards');
  const [showAteliersModal, setShowAteliersModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [newAtelierLabel, setNewAtelierLabel] = useState('');
  const [newAtelierColor, setNewAtelierColor] = useState(COLOR_PRESETS[0]);
  const [savingAtelier, setSavingAtelier] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [{ data: refsData }, { data: categoriesData }] = await Promise.all([
        supabase
          .from('product_references')
          .select(`
            *,
            category:categories(id, nom),
            articles:product_articles(*)
          `)
          .order('name'),
        supabase.from('categories').select('*').order('ordre'),
      ]);

      setReferences(refsData || []);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addAtelier() {
    if (!newAtelierLabel.trim()) return;
    setSavingAtelier(true);
    try {
      const value = newAtelierLabel.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const { error } = await supabase.from('ateliers').insert({
        value,
        label: newAtelierLabel.trim(),
        color: newAtelierColor.color,
        bg_color: newAtelierColor.bgColor,
        sort_order: ateliers.length + 1,
      });
      if (error) { alert(`Erreur : ${error.message}`); return; }
      await refreshAteliers();
      setNewAtelierLabel('');
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setSavingAtelier(false);
    }
  }

  async function deleteAtelier(atelier: AtelierDB) {
    if (!confirm(`Supprimer l'atelier "${atelier.label}" ?`)) return;
    const { error } = await supabase.from('ateliers').delete().eq('id', atelier.id);
    if (error) { alert(`Erreur suppression : ${error.message}`); return; }
    if (selectedAtelier === atelier.value) setSelectedAtelier('all');
    await refreshAteliers();
  }

  async function toggleReferenceActive(ref: ProductReference) {
    try {
      await supabase
        .from('product_references')
        .update({ is_active: !ref.is_active })
        .eq('id', ref.id);

      setReferences(references.map(r =>
        r.id === ref.id ? { ...r, is_active: !r.is_active } : r
      ));
    } catch (error) {
      console.error('Erreur:', error);
    }
  }

  async function toggleArticleActive(article: ProductArticle) {
    try {
      await supabase
        .from('product_articles')
        .update({ is_active: !article.is_active })
        .eq('id', article.id);

      setReferences(references.map(ref => ({
        ...ref,
        articles: ref.articles.map(a =>
          a.id === article.id ? { ...a, is_active: !a.is_active } : a
        )
      })));
    } catch (error) {
      console.error('Erreur:', error);
    }
  }

  function toggleExpand(refId: string) {
    const newExpanded = new Set(expandedRefs);
    if (newExpanded.has(refId)) {
      newExpanded.delete(refId);
    } else {
      newExpanded.add(refId);
    }
    setExpandedRefs(newExpanded);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  }

  const filteredReferences = references.filter(ref => {
    const matchSearch = ref.name.toLowerCase().includes(search.toLowerCase()) ||
                       ref.code.toLowerCase().includes(search.toLowerCase());
    const matchCategory = selectedCategory === 'all' || ref.category_id === selectedCategory;
    const matchAtelier = selectedAtelier === 'all' || ref.atelier === selectedAtelier;
    const matchActive = showInactive || ref.is_active;
    return matchSearch && matchCategory && matchAtelier && matchActive;
  }).sort((a, b) => {
    let valA: string | number = '';
    let valB: string | number = '';
    switch (sortKey) {
      case 'code':      valA = a.code.toLowerCase(); valB = b.code.toLowerCase(); break;
      case 'name':      valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
      case 'category':  valA = ((a.category as any)?.nom || '').toLowerCase(); valB = ((b.category as any)?.nom || '').toLowerCase(); break;
      case 'atelier':   valA = a.atelier || ''; valB = b.atelier || ''; break;
      case 'price':     valA = a.base_unit_price; valB = b.base_unit_price; break;
      case 'articles':  valA = a.articles?.length || 0; valB = b.articles?.length || 0; break;
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalArticles = filteredReferences.reduce((acc, ref) => acc + (ref.articles?.length || 0), 0);
  const activeFiltersCount = [
    selectedCategory !== 'all',
    selectedAtelier !== 'all',
    showInactive,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Catalogue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredReferences.length} réf · {totalArticles} articles
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Vue tableau (desktop seulement) */}
          <div className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => setViewMode('tableau')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'tableau' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <Table2 size={20} />
            </button>
          </div>
          <button
            onClick={() => setShowAteliersModal(true)}
            className="p-2 lg:px-4 lg:py-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <Settings size={18} />
            <span className="hidden lg:inline font-medium">Ateliers</span>
          </button>
          <Link
            href="/catalogue/nouveau"
            className="flex items-center gap-2 px-3 py-2 lg:px-4 lg:py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nouvelle référence</span>
          </Link>
        </div>
      </div>

      {/* Barre recherche + filtre */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              showFilters || activeFiltersCount > 0
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Filtres</span>
            {activeFiltersCount > 0 && (
              <span className="w-5 h-5 bg-white text-blue-600 rounded-full text-xs font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Panneau filtres */}
        {showFilters && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 animate-slide-up">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">Toutes les catégories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.nom}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2.5 border border-gray-200 rounded-xl bg-white">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Voir inactifs</span>
              </label>
            </div>
            {activeFiltersCount > 0 && (
              <button
                onClick={() => { setSelectedCategory('all'); setSelectedAtelier('all'); setShowInactive(false); }}
                className="text-sm text-red-500 font-medium"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        {/* Chips ateliers */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setSelectedAtelier('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedAtelier === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tous
          </button>
          {ateliers.map((atelier) => (
            <button
              key={atelier.value}
              onClick={() => setSelectedAtelier(atelier.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                selectedAtelier === atelier.value ? 'ring-2 ring-offset-1 ring-gray-400' : 'hover:opacity-80'
              }`}
              style={{ backgroundColor: atelier.bg_color, color: atelier.color }}
            >
              {atelier.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {filteredReferences.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500">Aucune référence trouvée</p>
          <Link href="/catalogue/nouveau" className="inline-flex items-center gap-2 mt-4 text-blue-600 font-medium">
            <Plus size={18} /> Créer une référence
          </Link>
        </div>

      ) : viewMode === 'tableau' ? (
        /* Vue tableau — desktop uniquement */
        <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    { key: 'code', label: 'Code' },
                    { key: 'name', label: 'Nom' },
                    { key: 'category', label: 'Catégorie' },
                    { key: 'atelier', label: 'Atelier' },
                    { key: 'price', label: 'Prix base' },
                    { key: 'articles', label: 'Articles' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    >
                      <span className="flex items-center gap-1">{col.label} <SortIcon col={col.key} /></span>
                    </th>
                  ))}
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredReferences.map((ref) => {
                  const atelierStyle = getAtelierStyle(ref.atelier);
                  const activeArticles = ref.articles?.filter(a => showInactive || a.is_active) || [];
                  return (
                    <tr key={ref.id} className={`hover:bg-gray-50 transition-colors ${!ref.is_active ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{ref.code}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{ref.name}</p>
                        {ref.description && <p className="text-xs text-gray-500 truncate max-w-[200px]">{ref.description}</p>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{(ref.category as any)?.nom || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}>
                          {atelierStyle.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatPrice(ref.base_unit_price)} / {ref.base_unit}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{activeArticles.length} article{activeArticles.length !== 1 ? 's' : ''}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/catalogue/${ref.id}`} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => toggleReferenceActive(ref)}
                            className={`p-2 rounded-lg transition-colors ${ref.is_active ? 'text-gray-400 hover:text-orange-600 hover:bg-orange-50' : 'text-orange-600 bg-orange-50'}`}
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      ) : null}

      {/* Vue cartes — toujours visible sur mobile, visible en desktop si mode cards */}
      {(viewMode === 'cards' || true) && filteredReferences.length > 0 && (
        <div className={`space-y-2 ${viewMode === 'tableau' ? 'lg:hidden' : ''}`}>
          {filteredReferences.map((ref) => {
            const atelierStyle = getAtelierStyle(ref.atelier);
            const isExpanded = expandedRefs.has(ref.id);
            const activeArticles = ref.articles?.filter(a => showInactive || a.is_active) || [];

            return (
              <div
                key={ref.id}
                className={`bg-white rounded-2xl border transition-all ${
                  ref.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'
                }`}
              >
                {/* En-tête référence */}
                <button
                  onClick={() => toggleExpand(ref.id)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-center gap-3">
                    {/* Indicateur couleur atelier */}
                    <div
                      className="w-1 self-stretch rounded-full flex-shrink-0"
                      style={{ backgroundColor: atelierStyle.color, minHeight: 40 }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {ref.code}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}
                        >
                          {atelierStyle.label}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{ref.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{(ref.category as any)?.nom || 'Sans catégorie'}</span>
                        <span className="text-gray-300">·</span>
                        <span className="flex items-center gap-1">
                          <Layers size={11} />
                          {activeArticles.length} article{activeArticles.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="font-medium text-gray-700">{formatPrice(ref.base_unit_price)}/{ref.base_unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link
                        href={`/catalogue/${ref.id}`}
                        onClick={e => e.stopPropagation()}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </Link>
                      {isExpanded
                        ? <ChevronDown size={18} className="text-gray-400" />
                        : <ChevronRight size={18} className="text-gray-400" />
                      }
                    </div>
                  </div>
                </button>

                {/* Articles expandés */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
                    <div className="p-3 space-y-2">
                      {activeArticles.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-gray-500 text-sm mb-2">Aucun article</p>
                          <Link
                            href={`/catalogue/${ref.id}?tab=articles`}
                            className="inline-flex items-center gap-1 text-blue-600 text-sm font-medium"
                          >
                            <Plus size={14} /> Créer un article
                          </Link>
                        </div>
                      ) : (
                        <>
                          {activeArticles.map((article) => {
                            const stateStyle = getProductStateStyle(article.product_state);
                            const packLabel = PACK_TYPES.find(p => p.value === article.pack_type)?.label || article.pack_type;
                            const price = calculateArticlePrice(article, ref);

                            return (
                              <div
                                key={article.id}
                                className={`flex items-center justify-between p-3 bg-white rounded-xl border ${
                                  article.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}
                                  >
                                    {stateStyle.label}
                                  </span>
                                  <span className="text-sm text-gray-600">
                                    {packLabel} de {article.quantity}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="font-semibold text-gray-900 text-sm">{formatPrice(price)}</p>
                                    {article.custom_price && (
                                      <p className="text-xs text-orange-600">Perso.</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => toggleArticleActive(article)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      article.is_active
                                        ? 'text-gray-400 hover:text-orange-600 hover:bg-orange-50'
                                        : 'text-orange-600 bg-orange-50'
                                    }`}
                                  >
                                    <Archive size={15} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          <Link
                            href={`/catalogue/${ref.id}?tab=articles`}
                            className="flex items-center justify-center gap-2 p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors text-sm font-medium"
                          >
                            <Plus size={15} />
                            Ajouter un article
                          </Link>
                        </>
                      )}
                    </div>

                    {/* Actions rapides en bas */}
                    <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between">
                      <button
                        onClick={() => toggleReferenceActive(ref)}
                        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          ref.is_active
                            ? 'text-gray-500 hover:text-orange-600 hover:bg-orange-50'
                            : 'text-orange-600 bg-orange-50'
                        }`}
                      >
                        <Archive size={13} />
                        {ref.is_active ? 'Archiver' : 'Réactiver'}
                      </button>
                      <Link
                        href={`/catalogue/${ref.id}`}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={13} />
                        Modifier la référence
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal gestion ateliers */}
      {showAteliersModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowAteliersModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl lg:relative lg:inset-auto lg:rounded-2xl lg:max-w-md lg:mx-auto">
            {/* Handle mobile */}
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Gérer les ateliers</h2>
              <button onClick={() => setShowAteliersModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Liste existante */}
              <div className="space-y-2">
                {ateliers.map((atelier) => (
                  <div key={atelier.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: atelier.color }} />
                      <span className="font-medium text-gray-900">{atelier.label}</span>
                      <span className="text-xs text-gray-400 font-mono">{atelier.value}</span>
                    </div>
                    <button
                      onClick={() => deleteAtelier(atelier)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Ajouter un atelier */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Ajouter un atelier</p>
                <input
                  type="text"
                  placeholder="Nom de l'atelier"
                  value={newAtelierLabel}
                  onChange={(e) => setNewAtelierLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAtelier()}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setNewAtelierColor(preset)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        newAtelierColor === preset ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                      }`}
                      style={{ backgroundColor: preset.bgColor, color: preset.color }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={addAtelier}
                  disabled={!newAtelierLabel.trim() || savingAtelier}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingAtelier ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
