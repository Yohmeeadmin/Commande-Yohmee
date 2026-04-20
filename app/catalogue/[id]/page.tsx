'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, RotateCcw, AlertCircle, Archive } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  Category,
  PACK_TYPES,
  PRODUCT_STATES,
  PackType,
  ProductState,
  ProductArticle,
  generateArticleDisplayName,
} from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { formatPrice } from '@/lib/utils';
import { usePermissions } from '@/lib/permissions';

interface ArticleForm {
  id: string;
  db_id?: string; // ID en base de données (si existant)
  pack_type: PackType;
  quantity: number;
  product_state: ProductState;
  custom_price: string;
  is_price_modified: boolean;
  prix_pro: string;
  prix_particulier: string;
  is_active: boolean;
  is_new: boolean; // true si créé localement, pas encore en DB
  is_deleted: boolean; // true si marqué pour suppression
}

export default function EditReferencePage() {
  const params = useParams();
  const router = useRouter();
  const { ateliers } = useAteliers();
  const { can } = usePermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    loadData();
  }, [params.id]);

  async function loadData() {
    try {
      const [{ data: refData }, { data: categoriesData }] = await Promise.all([
        supabase
          .from('product_references')
          .select('*, articles:product_articles(*)')
          .eq('id', params.id)
          .single(),
        supabase.from('categories').select('*').order('ordre'),
      ]);

      if (refData) {
        setReference({
          code: refData.code || '',
          name: refData.name || '',
          category_id: refData.category_id || '',
          atelier: refData.atelier || 'boulangerie',
          base_unit: refData.base_unit || 'pièce',
          base_unit_price: refData.base_unit_price?.toString() || '',
          vat_rate: refData.vat_rate?.toString() || '20',
          description: refData.description || '',
          note_production: refData.note_production || '',
          is_active: refData.is_active !== false,
        });

        // Convertir les articles existants
        const existingArticles: ArticleForm[] = (refData.articles || []).map((a: ProductArticle) => ({
          id: crypto.randomUUID(),
          db_id: a.id,
          pack_type: a.pack_type,
          quantity: a.quantity,
          product_state: a.product_state,
          custom_price: a.custom_price?.toString() || '',
          is_price_modified: a.custom_price !== null,
          prix_pro: a.prix_pro?.toString() || '',
          prix_particulier: a.prix_particulier?.toString() || '',
          is_active: a.is_active,
          is_new: false,
          is_deleted: false,
        }));

        setArticles(existingArticles);
      }

      setCategories(categoriesData || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
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
      is_active: true,
      is_new: true,
      is_deleted: false,
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
    setArticles(articles.map(a => {
      if (a.id !== id) return a;
      // Si c'est un article existant, le marquer pour suppression
      if (!a.is_new) {
        return { ...a, is_deleted: true };
      }
      // Si c'est un nouvel article, le retirer de la liste
      return a;
    }).filter(a => a.is_new ? a.id !== id : true));
  }

  // Restaurer un article supprimé
  function restoreArticle(id: string) {
    setArticles(articles.map(a =>
      a.id === id ? { ...a, is_deleted: false } : a
    ));
  }

  // Calculer le prix d'un article
  function getCalculatedPrice(article: ArticleForm): number {
    const basePrice = parseFloat(reference.base_unit_price) || 0;
    return basePrice * article.quantity;
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

    setSaving(true);
    try {
      // 1. Mettre à jour la référence produit
      const { error: refError } = await supabase
        .from('product_references')
        .update({
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
        })
        .eq('id', params.id);

      if (refError) throw refError;

      // 2. Gérer les articles

      // Articles à supprimer
      const toDelete = articles.filter(a => a.is_deleted && a.db_id);
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('product_articles')
          .delete()
          .in('id', toDelete.map(a => a.db_id));
        if (error) throw error;
      }

      // Articles à créer
      const toCreate = articles.filter(a => a.is_new && !a.is_deleted);
      if (toCreate.length > 0) {
        const { error } = await supabase
          .from('product_articles')
          .insert(toCreate.map(a => ({
            product_reference_id: params.id,
            pack_type: a.pack_type,
            quantity: a.quantity,
            product_state: a.product_state,
            custom_price: a.is_price_modified && a.custom_price !== ''
              ? parseFloat(a.custom_price)
              : null,
            prix_pro: a.prix_pro !== '' ? parseFloat(a.prix_pro) : null,
            prix_particulier: a.prix_particulier !== '' ? parseFloat(a.prix_particulier) : null,
            is_active: a.is_active,
          })));
        if (error) throw error;
      }

      // Articles à mettre à jour
      const toUpdate = articles.filter(a => !a.is_new && !a.is_deleted && a.db_id);
      for (const article of toUpdate) {
        const { error } = await supabase
          .from('product_articles')
          .update({
            pack_type: article.pack_type,
            quantity: article.quantity,
            product_state: article.product_state,
            custom_price: article.is_price_modified && article.custom_price !== ''
              ? parseFloat(article.custom_price)
              : null,
            prix_pro: article.prix_pro !== '' ? parseFloat(article.prix_pro) : null,
            prix_particulier: article.prix_particulier !== '' ? parseFloat(article.prix_particulier) : null,
            is_active: article.is_active,
          })
          .eq('id', article.db_id);
        if (error) throw error;
      }

      router.push('/catalogue');
      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette référence et tous ses articles ?')) return;

    try {
      // Supprimer les articles d'abord
      await supabase.from('product_articles').delete().eq('product_reference_id', params.id);
      // Puis la référence
      await supabase.from('product_references').delete().eq('id', params.id);
      router.push('/catalogue');
      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la suppression');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeArticles = articles.filter(a => !a.is_deleted);
  const deletedArticles = articles.filter(a => a.is_deleted);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/catalogue"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Modifier la référence</h1>
            <p className="text-gray-500 mt-1">{reference.code} - {reference.name}</p>
          </div>
        </div>
        {can('catalogue.delete') && (
          <button
            onClick={handleDelete}
            className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            title="Supprimer"
          >
            <Trash2 size={20} />
          </button>
        )}
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
                Catégorie
              </label>
              <select
                value={reference.category_id}
                onChange={(e) => setReference({ ...reference, category_id: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">Sélectionner une catégorie</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.nom}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Atelier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Atelier *
            </label>
            <div className="flex flex-wrap gap-2">
              {ateliers.map((atelier) => (
                <button
                  key={atelier.value}
                  type="button"
                  onClick={() => setReference({ ...reference, atelier: atelier.value })}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    reference.atelier === atelier.value
                      ? 'ring-2 ring-offset-2'
                      : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: atelier.bg_color,
                    color: atelier.color,
                  }}
                >
                  {atelier.label}
                </button>
              ))}
            </div>
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
              <span className="text-sm text-gray-500">({activeArticles.length})</span>
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

          {activeArticles.length === 0 ? (
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
              {activeArticles.map((article, index) => {
                const calculatedPrice = getCalculatedPrice(article);
                const displayName = getDisplayName(article);
                const stateStyle = PRODUCT_STATES.find(s => s.value === article.product_state);

                return (
                  <div
                    key={article.id}
                    className={`border rounded-xl p-4 space-y-4 ${
                      article.is_new
                        ? 'border-blue-200 bg-blue-50/30'
                        : 'border-gray-200 bg-gray-50/50'
                    }`}
                  >
                    {/* En-tête article */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          article.is_new ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {index + 1}
                        </span>
                        {article.is_new && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">
                            Nouveau
                          </span>
                        )}
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateArticle(article.id, 'is_active', !article.is_active)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            article.is_active
                              ? 'text-gray-400 hover:bg-gray-100'
                              : 'text-orange-600 bg-orange-50'
                          }`}
                          title={article.is_active ? 'Désactiver' : 'Activer'}
                        >
                          <Archive size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeArticle(article.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
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
                      <div className="flex items-center gap-3">
                        {!article.is_active && (
                          <span className="text-orange-600 font-medium">Article inactif</span>
                        )}
                        {article.is_price_modified && (
                          <span className="text-orange-600 font-medium flex items-center gap-1">
                            <AlertCircle size={12} />
                            Prix modifié
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Articles supprimés (à supprimer à la sauvegarde) */}
          {deletedArticles.length > 0 && (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-3">
                Articles à supprimer ({deletedArticles.length})
              </p>
              <div className="space-y-2">
                {deletedArticles.map((article) => (
                  <div
                    key={article.id}
                    className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg"
                  >
                    <span className="text-sm text-red-700 line-through">
                      {getDisplayName(article)}
                    </span>
                    <button
                      type="button"
                      onClick={() => restoreArticle(article.id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Restaurer
                    </button>
                  </div>
                ))}
              </div>
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
            disabled={saving || !reference.name || !reference.code || !reference.base_unit_price}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
