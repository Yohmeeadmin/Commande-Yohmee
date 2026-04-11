'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, Search, CheckCircle, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  Client,
  Category,
  ProductArticle,
  ProductReference,
  DeliverySlot,
  calculateArticlePrice,
  getProductStateStyle,
} from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { formatPrice } from '@/lib/utils';

interface ArticleWithRef extends ProductArticle {
  product_reference: ProductReference;
}

interface OrderLine {
  id: string;
  article_id: string;
  article_display_name: string;
  quantite: number;
  prix_unitaire: number;
  unit_quantity: number;
  note: string;
}

export default function NouvelleCommandePage() {
  const router = useRouter();
  const { getStyle: getAtelierStyle } = useAteliers();
  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<ArticleWithRef[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [form, setForm] = useState({
    client_id: '',
    date_livraison: new Date().toISOString().split('T')[0],
    delivery_slot_id: '',
    note: '',
    reminder_days: null as number | null,
  });

  const [lines, setLines] = useState<OrderLine[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: clientsData }, { data: articlesData }, { data: categoriesData }, { data: slotsData }] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('nom'),
      supabase
        .from('product_articles')
        .select('*, product_reference:product_references(*)')
        .eq('is_active', true)
        .order('display_name'),
      supabase.from('categories').select('*').order('ordre'),
      supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order'),
    ]);

    setClients(clientsData || []);
    setArticles((articlesData as ArticleWithRef[]) || []);
    setCategories(categoriesData || []);
    setDeliverySlots(slotsData || []);
  }

  const addArticle = (article: ArticleWithRef) => {
    const existing = lines.find(l => l.article_id === article.id);
    const price = calculateArticlePrice(article, article.product_reference);

    if (existing) {
      setLines(lines.map(l =>
        l.article_id === article.id
          ? { ...l, quantite: l.quantite + 1 }
          : l
      ));
    } else {
      setLines([...lines, {
        id: crypto.randomUUID(),
        article_id: article.id,
        article_display_name: article.display_name,
        quantite: 1,
        prix_unitaire: price,
        unit_quantity: article.quantity,
        note: '',
      }]);
    }
    setSearchProduct('');
  };

  const updateLine = (id: string, updates: Partial<OrderLine>) => {
    setLines(lines.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const removeLine = (id: string) => {
    setLines(lines.filter(l => l.id !== id));
  };

  const total = lines.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0);

  const filteredArticles = articles.filter(a => {
    const ref = a.product_reference;
    const matchSearch =
      a.display_name.toLowerCase().includes(searchProduct.toLowerCase()) ||
      ref?.name?.toLowerCase().includes(searchProduct.toLowerCase()) ||
      ref?.code?.toLowerCase().includes(searchProduct.toLowerCase());
    const matchCategory = selectedCategory === 'all' || ref?.category_id === selectedCategory;
    return matchSearch && matchCategory;
  });

  async function handleSubmit(e: React.FormEvent, status: 'brouillon' | 'confirmee' = 'confirmee') {
    e.preventDefault();
    if (!form.client_id || lines.length === 0) {
      alert('Veuillez sélectionner un client et ajouter au moins un produit');
      return;
    }

    setLoading(true);
    try {
      // Créer la commande
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          client_id: form.client_id,
          delivery_date: form.date_livraison,
          delivery_slot_id: form.delivery_slot_id || null,
          note: form.note || null,
          reminder_days: form.reminder_days,
          status: status,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Créer les lignes
      const { error: linesError } = await supabase
        .from('order_items')
        .insert(lines.map(l => ({
          order_id: order.id,
          product_article_id: l.article_id,
          quantity_ordered: l.quantite,
          unit_price: l.prix_unitaire,
          article_unit_quantity: l.unit_quantity,
          note: l.note || null,
        })));

      if (linesError) throw linesError;

      router.push(`/commandes/${order.id}`);
      router.refresh();
    } catch (error: any) {
      console.error('Erreur:', error);
      alert(`Erreur: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/commandes"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouvelle commande</h1>
          <p className="text-gray-500 mt-1">Créer une nouvelle commande</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche - Infos commande */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client et date */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Informations</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client *
                </label>
                <select
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  required
                >
                  <option value="">Sélectionner un client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.nom}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de livraison *
                </label>
                <input
                  type="date"
                  value={form.date_livraison}
                  onChange={(e) => setForm({ ...form, date_livraison: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Créneau de livraison
                </label>
                <select
                  value={form.delivery_slot_id}
                  onChange={(e) => setForm({ ...form, delivery_slot_id: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">Sélectionner un créneau</option>
                  {deliverySlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.name} ({slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <Bell size={14} className="text-orange-500" />
                  Rappel avant livraison
                </label>
                <div className="flex gap-2">
                  {[
                    { label: 'Aucun', days: null },
                    { label: '1 jour', days: 1 },
                    { label: '2 jours', days: 2 },
                    { label: '1 semaine', days: 7 },
                  ].map(({ label, days }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setForm({ ...form, reminder_days: days })}
                      className={`flex-1 py-2 px-2 rounded-xl text-sm font-medium border transition-colors ${
                        form.reminder_days === days
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note
                </label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Note générale..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Ajout articles */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Ajouter des articles</h2>

            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Rechercher un article..."
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="all">Toutes</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.nom}</option>
                ))}
              </select>
            </div>

            {/* Liste articles rapide */}
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {filteredArticles.slice(0, 20).map((article) => {
                const ref = article.product_reference;
                const price = calculateArticlePrice(article, ref);
                const atelierStyle = getAtelierStyle(ref.atelier);
                const stateStyle = getProductStateStyle(article.product_state);

                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => addArticle(article)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{article.display_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}
                        >
                          {atelierStyle.label}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}
                        >
                          {stateStyle.label}
                        </span>
                        <span className="text-sm text-gray-500">{formatPrice(price)}</span>
                      </div>
                    </div>
                    <Plus size={20} className="text-blue-600" />
                  </button>
                );
              })}
              {filteredArticles.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-500">
                  Aucun article trouvé
                </div>
              )}
            </div>
          </div>

          {/* Lignes de commande */}
          {lines.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Articles commandés ({lines.length})</h2>

              <div className="space-y-3">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{line.article_display_name}</p>
                      <p className="text-sm text-gray-500">{formatPrice(line.prix_unitaire)} / unité</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, { quantite: Math.max(1, line.quantite - 1) })}
                        className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={line.quantite}
                        onChange={(e) => updateLine(line.id, { quantite: parseInt(e.target.value) || 1 })}
                        className="w-16 text-center px-2 py-1 border border-gray-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, { quantite: line.quantite + 1 })}
                        className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>

                    <div className="w-24 text-right font-medium text-gray-900">
                      {formatPrice(line.quantite * line.prix_unitaire)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite - Récapitulatif */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 sticky top-8">
            <h2 className="font-semibold text-gray-900 mb-4">Récapitulatif</h2>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-gray-600">
                <span>Articles</span>
                <span>{lines.length}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Quantité totale</span>
                <span>{lines.reduce((sum, l) => sum + l.quantite, 0)}</span>
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-xl font-bold text-gray-900">{formatPrice(total)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={(e) => handleSubmit(e, 'confirmee')}
                disabled={loading || !form.client_id || lines.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle size={20} />
                {loading ? 'Enregistrement...' : 'Confirmer la commande'}
              </button>

              <button
                type="button"
                onClick={(e) => handleSubmit(e, 'brouillon')}
                disabled={loading || !form.client_id || lines.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                <Save size={20} />
                Enregistrer brouillon
              </button>

              <Link
                href="/commandes"
                className="w-full inline-flex items-center justify-center px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
              >
                Annuler
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
