'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, RotateCcw, AlertCircle, X, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  Category,
  PACK_TYPES,
  PRODUCT_STATES,
  PackType,
  ProductState,
  generateArticleDisplayName,
} from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { formatPrice } from '@/lib/utils';

interface ArticleForm {
  id: string; // ID temporaire côté client
  pack_type: PackType;
  quantity: number;
  product_state: ProductState;
  custom_price: string;
  is_price_modified: boolean;
  prix_pro: string;
  prix_particulier: string;
}

export default function NouvelleReferencePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company') || localStorage.getItem('catalogue_company_id') || '';
  const { ateliers } = useAteliers();
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);
  const [loading, setLoading] = useState(false);

  // Formulaire référence
  const [reference, setReference] = useState({
    code: '',
    name: '',
    category_id: '',
    atelier: 'boulangerie',
    base_unit: 'pièce',
    base_unit_price: '',
    vat_rate: '20',
    description: '',
    note_production: '',
    is_active: true,
  });

  // Articles
  const [articles, setArticles] = useState<ArticleForm[]>([]);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    const { data } = await supabase.from('categories').select('*').order('ordre');
    setCategories(data || []);
  }

  async function createCategory() {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    try {
      const maxOrdre = categories.filter(c => c.atelier === reference.atelier).reduce((m, c) => Math.max(m, c.ordre), 0);
      const { data, error } = await supabase
        .from('categories')
        .insert({ nom: newCatName.trim(), atelier: reference.atelier, ordre: maxOrdre + 1, company_id: companyId || null })
        .select()
        .single();
      if (!error && data) {
        setCategories(prev => [...prev, data]);
        setReference(prev => ({ ...prev, category_id: data.id }));
        setNewCatName('');
        setAddingCat(false);
      }
    } finally {
      setCreatingCat(false);
    }
  }

  // Ajouter un article
  function addArticle() {
    const newArticle: ArticleForm = {
      id: crypto.randomUUID(),
      pack_type: 'unite',
      quantity: 1,
      product_state: 'frais',
      custom_price: '',
      is_price_modified: false,
      prix_pro: '',
      prix_particulier: '',
    };
    setArticles([...articles, newArticle]);
  }

  // Modifier un article
  function updateArticle(id: string, field: keyof ArticleForm, value: any) {
    setArticles(articles.map(a => {
      if (a.id !== id) return a;

      const updated = { ...a, [field]: value };

      // Si on modifie le prix manuellement
      if (field === 'custom_price' && value !== '') {
        updated.is_price_modified = true;
      }

      return updated;
    }));
  }

  // Réinitialiser le prix d'un article
  function resetPrice(id: string) {
    setArticles(articles.map(a =>
      a.id === id ? { ...a, custom_price: '', is_price_modified: false } : a
    ));
  }

  // Supprimer un article
  function removeArticle(id: string) {
    setArticles(articles.filter(a => a.id !== id));
  }

  // Calculer le prix d'un article
  function getCalculatedPrice(article: ArticleForm): number {
    const basePrice = parseFloat(reference.base_unit_price) || 0;
    return basePrice * article.quantity;
  }

  // Obtenir le prix final d'un article
  function getFinalPrice(article: ArticleForm): number {
    if (article.is_price_modified && article.custom_price !== '') {
      return parseFloat(article.custom_price) || 0;
    }
    return getCalculatedPrice(article);
  }

  // Générer le libellé d'un article
  function getDisplayName(article: ArticleForm): string {
    return generateArticleDisplayName(
      reference.code || 'REF',
      reference.name || 'Produit',
      article.pack_type,
      article.quantity,
      article.product_state
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reference.name || !reference.code) return;

    setLoading(true);
    try {
      // Vérifier si le code existe déjà
      const { data: existing } = await supabase
        .from('product_references')
        .select('id')
        .eq('code', reference.code)
        .single();

      if (existing) {
        alert(`Le code "${reference.code}" existe déjà. Veuillez utiliser un code différent.`);
        setLoading(false);
        return;
      }

      // 1. Créer la référence produit
      const refPayload = {
        code: reference.code,
        name: reference.name,
        category_id: reference.category_id || null,
        atelier: reference.atelier,
        base_unit: reference.base_unit,
        base_unit_price: parseFloat(reference.base_unit_price) || 0,
        vat_rate: parseFloat(reference.vat_rate) || 20,
        description: reference.description || null,
        note_production: reference.note_production || null,
        is_active: reference.is_active,
        company_id: companyId || null,
      };
      console.log('Payload référence:', refPayload);

      const { data: refData, error: refError } = await supabase
        .from('product_references')
        .insert(refPayload)
        .select()
        .single();

      console.log('Résultat insert:', { refData, refError });

      if (refError) throw refError;

      // 2. Créer les articles
      if (articles.length > 0 && refData) {
        const articlesToInsert = articles.map(a => ({
          product_reference_id: refData.id,
          pack_type: a.pack_type,
          quantity: a.quantity,
          product_state: a.product_state,
          custom_price: a.is_price_modified && a.custom_price !== ''
            ? parseFloat(a.custom_price)
            : null,
          prix_pro: a.prix_pro !== '' ? parseFloat(a.prix_pro) : null,
          prix_particulier: a.prix_particulier !== '' ? parseFloat(a.prix_particulier) : null,
          is_active: true,
        }));

        const { error: articlesError } = await supabase
          .from('product_articles')
          .insert(articlesToInsert);

        if (articlesError) throw articlesError;
      }

      router.push('/catalogue');
      router.refresh();
    } catch (error: any) {
      console.error('Erreur complète:', error);
      console.error('Message:', error?.message);
      console.error('Details:', error?.details);
      console.error('Hint:', error?.hint);
      console.error('Code:', error?.code);
      alert(`Erreur: ${error?.message || error?.details || JSON.stringify(error)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/catalogue"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouvelle référence</h1>
          <p className="text-gray-500 mt-1">Créer un produit et ses articles de vente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ============================================ */}
        {/* BLOC 1 : RÉFÉRENCE PRODUIT */}
        {/* ============================================ */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">
              1
            </div>
            <h2 className="font-semibold text-gray-900">Référence produit</h2>
          </div>

          {/* Nom et Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du produit *
              </label>
              <input
                type="text"
                value={reference.name}
                onChange={(e) => setReference({ ...reference, name: e.target.value })}
                placeholder="Ex: Petite tradition"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Code référence *
              </label>
              <input
                type="text"
                value={reference.code}
                onChange={(e) => setReference({ ...reference, code: e.target.value.toUpperCase() })}
                placeholder="Ex: BOU-TRAD-001"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono uppercase"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Atelier *
              </label>
              <div className="flex flex-wrap gap-2">
                {ateliers.map((atelier) => (
                  <button
                    key={atelier.value}
                    type="button"
                    onClick={() => setReference(prev => ({ ...prev, atelier: atelier.value, category_id: '' }))}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      reference.atelier === atelier.value ? 'ring-2 ring-offset-2' : 'hover:opacity-80'
                    }`}
                    style={{ backgroundColor: atelier.bg_color, color: atelier.color }}
                  >
                    {atelier.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Catégorie */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Catégorie</label>
              {!addingCat && (
                <button type="button" onClick={() => setAddingCat(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Plus size={13} /> Nouvelle catégorie
                </button>
              )}
            </div>

            {addingCat ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); } }}
                  placeholder={`Nouvelle catégorie pour ${reference.atelier}…`}
                  className="flex-1 px-3 py-2 border border-blue-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="button" onClick={createCategory} disabled={creatingCat || !newCatName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {creatingCat ? '…' : 'Créer'}
                </button>
                <button type="button" onClick={() => { setAddingCat(false); setNewCatName(''); }}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  value={reference.category_id}
                  onChange={(e) => setReference({ ...reference, category_id: e.target.value })}
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">Sans catégorie</option>
                  {categories.filter(c => c.atelier === reference.atelier).map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nom}</option>
                  ))}
                  {categories.filter(c => c.atelier === reference.atelier).length === 0 && (
                    <option disabled>Aucune catégorie pour cet atelier</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={reference.description}
              onChange={(e) => setReference({ ...reference, description: e.target.value })}
              placeholder="Description courte du produit..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Prix unitaire et unité */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prix unitaire de base (MAD) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={reference.base_unit_price}
                onChange={(e) => setReference({ ...reference, base_unit_price: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Prix pour 1 unité de base</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unité de base
              </label>
              <select
                value={reference.base_unit}
                onChange={(e) => setReference({ ...reference, base_unit: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="pièce">Pièce</option>
                <option value="kg">Kilogramme</option>
                <option value="g">Gramme</option>
                <option value="litre">Litre</option>
                <option value="portion">Portion</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                TVA (%)
              </label>
              <select
                value={reference.vat_rate}
                onChange={(e) => setReference({ ...reference, vat_rate: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="0">0%</option>
                <option value="7">7%</option>
                <option value="10">10%</option>
                <option value="14">14%</option>
                <option value="20">20%</option>
              </select>
            </div>
          </div>

          {/* Note production */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note interne production
            </label>
            <textarea
              value={reference.note_production}
              onChange={(e) => setReference({ ...reference, note_production: e.target.value })}
              placeholder="Notes pour l'équipe de production..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Statut actif */}
          <div className="pt-4 border-t border-gray-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={reference.is_active}
                onChange={(e) => setReference({ ...reference, is_active: e.target.checked })}
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
              <div>
                <span className="font-medium text-gray-700">Référence active</span>
                <p className="text-sm text-gray-500">Disponible pour créer des commandes</p>
              </div>
            </label>
          </div>
        </div>

        {/* ============================================ */}
        {/* BLOC 2 : ARTICLES DE VENTE */}
        {/* ============================================ */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h2 className="font-semibold text-gray-900">Articles de vente</h2>
              <span className="text-sm text-gray-500">({articles.length})</span>
            </div>
            <button
              type="button"
              onClick={addArticle}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-medium hover:bg-blue-100 transition-colors text-sm"
            >
              <Plus size={18} />
              Ajouter un article
            </button>
          </div>

          {articles.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="text-gray-400" size={24} />
              </div>
              <p className="text-gray-500 mb-4">Aucun article de vente</p>
              <button
                type="button"
                onClick={addArticle}
                className="inline-flex items-center gap-2 text-blue-600 font-medium"
              >
                <Plus size={18} />
                Créer le premier article
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {articles.map((article, index) => {
                const calculatedPrice = getCalculatedPrice(article);
                const finalPrice = getFinalPrice(article);
                const displayName = getDisplayName(article);
                const stateStyle = PRODUCT_STATES.find(s => s.value === article.product_state);

                return (
                  <div
                    key={article.id}
                    className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50/50"
                  >
                    {/* En-tête article */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: stateStyle?.bgColor || '#F3F4F6',
                            color: stateStyle?.color || '#6B7280',
                          }}
                        >
                          {stateStyle?.label || article.product_state}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeArticle(article.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Libellé généré */}
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 mb-1">Libellé généré</p>
                      <p className="font-mono text-sm text-gray-900">{displayName}</p>
                    </div>

                    {/* Champs article */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Conditionnement
                        </label>
                        <select
                          value={article.pack_type}
                          onChange={(e) => updateArticle(article.id, 'pack_type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          {PACK_TYPES.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Quantité
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={article.quantity}
                          onChange={(e) => updateArticle(article.id, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          État produit
                        </label>
                        <select
                          value={article.product_state}
                          onChange={(e) => updateArticle(article.id, 'product_state', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          {PRODUCT_STATES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Prix final (MAD)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={article.is_price_modified ? article.custom_price : calculatedPrice.toFixed(2)}
                            onChange={(e) => updateArticle(article.id, 'custom_price', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              article.is_price_modified
                                ? 'border-orange-300 bg-orange-50'
                                : 'border-gray-200'
                            }`}
                          />
                          {article.is_price_modified && (
                            <button
                              type="button"
                              onClick={() => resetPrice(article.id)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-orange-600 hover:bg-orange-100 rounded"
                              title="Réinitialiser au prix calculé"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Prix par type client */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          🏢 Prix Pro (MAD)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={article.prix_pro}
                          onChange={(e) => updateArticle(article.id, 'prix_pro', e.target.value)}
                          placeholder={`Défaut: ${calculatedPrice.toFixed(2)}`}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          👤 Prix Particulier (MAD)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={article.prix_particulier}
                          onChange={(e) => updateArticle(article.id, 'prix_particulier', e.target.value)}
                          placeholder={`Défaut: ${calculatedPrice.toFixed(2)}`}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Indication prix */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        Prix calculé: {formatPrice(calculatedPrice)} ({reference.base_unit_price || '0'} x {article.quantity})
                      </span>
                      {article.is_price_modified && (
                        <span className="text-orange-600 font-medium flex items-center gap-1">
                          <AlertCircle size={12} />
                          Prix modifié manuellement
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link
            href="/catalogue"
            className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={loading || !reference.name || !reference.code || !reference.base_unit_price}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={20} />
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
