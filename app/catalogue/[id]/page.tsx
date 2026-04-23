'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, RotateCcw, AlertCircle, Archive, Globe, X, Search, Upload, Loader2 } from 'lucide-react';
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Portail – clients exclusifs
  const [allClients, setAllClients] = useState<{ id: string; nom: string }[]>([]);
  const [portalClientIds, setPortalClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState('');

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
    // Vitrine publique
    show_on_landing: false,
    description_publique: '',
    photo_url: '',
  });

  // Articles
  const [articles, setArticles] = useState<ArticleForm[]>([]);

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function loadData() {
    try {
      const [{ data: refData }, { data: categoriesData }, { data: clientsData }] = await Promise.all([
        supabase
          .from('product_references')
          .select('*, articles:product_articles(*)')
          .eq('id', params.id)
          .single(),
        supabase.from('categories').select('*').order('ordre'),
        supabase.from('clients').select('id, nom').eq('is_active', true).order('nom'),
      ]);
      setAllClients(clientsData || []);

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
          show_on_landing: refData.show_on_landing ?? false,
          description_publique: refData.description_publique || '',
          photo_url: refData.photo_url || '',
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

        // Récupère portal_client_ids depuis le premier article existant
        const firstWithIds = (refData.articles || []).find((a: any) => a.portal_client_ids?.length);
        if (firstWithIds) setPortalClientIds(firstWithIds.portal_client_ids);
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

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop();
    const path = `products/${params.id}.${ext}`;
    const { error } = await supabase.storage
      .from('catalogue')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      alert(`Erreur upload : ${error.message}`);
      setUploadingPhoto(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('catalogue').getPublicUrl(path);
    setReference(prev => ({ ...prev, photo_url: `${publicUrl}?t=${Date.now()}` }));
    setUploadingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = '';
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
          show_on_landing: reference.show_on_landing,
          description_publique: reference.description_publique || null,
          photo_url: reference.photo_url || null,
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
            portal_client_ids: portalClientIds.length > 0 ? portalClientIds : null,
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
            portal_client_ids: portalClientIds.length > 0 ? portalClientIds : null,
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

        {/* ============================================ */}
        {/* BLOC 3 : PORTAIL – CLIENTS EXCLUSIFS */}
        {/* ============================================ */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">
              3
            </div>
            <h2 className="font-semibold text-gray-900">Portail – Clients exclusifs</h2>
          </div>

          <p className="text-sm text-gray-500">
            Si vous sélectionnez des clients, cet article ne sera visible que pour eux dans leur portail. Laissez vide pour le rendre accessible à tous.
          </p>

          {/* Clients sélectionnés */}
          {portalClientIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {portalClientIds.map(cid => {
                const c = allClients.find(x => x.id === cid);
                if (!c) return null;
                return (
                  <span key={cid} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    {c.nom}
                    <button type="button" onClick={() => setPortalClientIds(prev => prev.filter(id => id !== cid))} className="hover:text-blue-900 transition-colors">
                      <X size={13} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Recherche client */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Rechercher un client à ajouter…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {clientSearch && (
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {allClients
                .filter(c => c.nom.toLowerCase().includes(clientSearch.toLowerCase()) && !portalClientIds.includes(c.id))
                .slice(0, 8)
                .map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setPortalClientIds(prev => [...prev, c.id]); setClientSearch(''); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-blue-50 text-left transition-colors text-sm"
                  >
                    <Plus size={13} className="text-blue-500 shrink-0" />
                    {c.nom}
                  </button>
                ))}
              {allClients.filter(c => c.nom.toLowerCase().includes(clientSearch.toLowerCase()) && !portalClientIds.includes(c.id)).length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-400">Aucun client trouvé</p>
              )}
            </div>
          )}

          {portalClientIds.length === 0 && !clientSearch && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Globe size={12} /> Visible par tous les clients avec accès au portail
            </p>
          )}
        </div>

        {/* ============================================ */}
        {/* BLOC 4 : VITRINE PUBLIQUE */}
        {/* ============================================ */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
            <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center font-bold text-sm">
              4
            </div>
            <h2 className="font-semibold text-gray-900">Vitrine publique</h2>
          </div>

          <p className="text-sm text-gray-500">
            Afficher ce produit sur la page d'accueil publique <strong>bdkfood.com</strong> (sans les prix).
          </p>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={reference.show_on_landing}
              onChange={e => setReference({ ...reference, show_on_landing: e.target.checked })}
              className="w-5 h-5 text-black rounded focus:ring-black"
            />
            <div>
              <span className="font-medium text-gray-700">Afficher sur la vitrine</span>
              <p className="text-sm text-gray-500">Le produit apparaîtra dans la bonne catégorie d'atelier</p>
            </div>
          </label>

          {reference.show_on_landing && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description publique
                </label>
                <textarea
                  value={reference.description_publique}
                  onChange={e => setReference({ ...reference, description_publique: e.target.value })}
                  placeholder="Description visible par les visiteurs (sans les prix, sans info interne)…"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Photo du produit
                </label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <div className="flex items-center gap-3">
                  {reference.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={reference.photo_url}
                      alt="Aperçu"
                      className="w-24 h-24 object-cover rounded-xl border border-gray-200 shrink-0"
                      onError={e => (e.currentTarget.style.display = 'none')}
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center shrink-0 bg-gray-50">
                      <Upload size={20} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {uploadingPhoto ? (
                        <><Loader2 size={15} className="animate-spin" /> Envoi…</>
                      ) : (
                        <><Upload size={15} /> {reference.photo_url ? 'Changer la photo' : 'Uploader une photo'}</>
                      )}
                    </button>
                    {reference.photo_url && (
                      <button
                        type="button"
                        onClick={() => setReference(prev => ({ ...prev, photo_url: '' }))}
                        className="inline-flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                      >
                        <X size={15} /> Supprimer
                      </button>
                    )}
                    <p className="text-xs text-gray-400">PNG, JPG, WebP · Max 5 Mo</p>
                  </div>
                </div>
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
