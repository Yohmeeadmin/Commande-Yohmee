'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, Search, CheckCircle, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  Client, Category, ProductArticle, ProductReference,
  DeliverySlot, calculateArticlePrice, getProductStateStyle,
} from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { formatPrice } from '@/lib/utils';
import MobileFlow from '@/components/commandes/mobile/MobileFlow';
import type { ArticleWithRef, OrderLine, OrderForm } from '@/components/commandes/mobile/types';

export default function NouvelleCommandePage() {
  const router = useRouter();
  const { getStyle: getAtelierStyle } = useAteliers();

  // ─── Data ───────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<ArticleWithRef[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);

  // ─── État partagé mobile + desktop ──────────────────────
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [form, setForm] = useState<OrderForm>({
    client_id: '',
    date_livraison: new Date().toISOString().split('T')[0],
    delivery_slot_id: '',
    note: '',
    rappel: false,
  });
  const [submitting, setSubmitting] = useState(false);

  // ─── Desktop only ────────────────────────────────────────
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [
      { data: clientsData },
      { data: articlesData },
      { data: categoriesData },
      { data: slotsData },
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('nom'),
      supabase.from('product_articles')
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

  // ─── Submit ─────────────────────────────────────────────
  async function handleSubmit(status: 'brouillon' | 'confirmee') {
    if (!form.client_id || lines.length === 0) {
      alert('Veuillez sélectionner un client et ajouter au moins un produit');
      return;
    }
    setSubmitting(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          client_id: form.client_id,
          delivery_date: form.date_livraison,
          delivery_slot_id: form.delivery_slot_id || null,
          note: form.note || null,
          rappel: form.rappel,
          status,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      const { error: linesError } = await supabase
        .from('order_items')
        .insert(lines.map(l => ({
          order_id: order.id,
          product_article_id: l.article_id,
          quantity_ordered: l.quantite,
          unit_price: l.prix_unitaire,
          article_unit_quantity: l.unit_quantity,
        })));
      if (linesError) throw linesError;

      router.push(`/commandes/${order.id}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      alert(`Erreur: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Desktop helpers ─────────────────────────────────────
  function desktopAddArticle(article: ArticleWithRef) {
    setLines(prev => {
      const existing = prev.find(l => l.article_id === article.id);
      const price = calculateArticlePrice(article, article.product_reference);
      if (existing) return prev.map(l => l.article_id === article.id ? { ...l, quantite: l.quantite + 1 } : l);
      return [...prev, {
        id: crypto.randomUUID(),
        article_id: article.id,
        article_display_name: article.display_name,
        quantite: 1,
        prix_unitaire: price,
        unit_quantity: article.quantity,
      }];
    });
    setSearchProduct('');
  }

  const total = lines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
  const filteredArticles = articles.filter(a => {
    const ref = a.product_reference;
    const matchSearch =
      a.display_name.toLowerCase().includes(searchProduct.toLowerCase()) ||
      ref?.name?.toLowerCase().includes(searchProduct.toLowerCase()) ||
      ref?.code?.toLowerCase().includes(searchProduct.toLowerCase());
    const matchCat = selectedCategory === 'all' || ref?.category_id === selectedCategory;
    return matchSearch && matchCat;
  });

  return (
    <>
      {/* ─── VERSION MOBILE ──────────────────────────────── */}
      <div className="lg:hidden">
        <MobileFlow
          clients={clients}
          articles={articles}
          categories={categories}
          deliverySlots={deliverySlots}
          lines={lines}
          setLines={setLines}
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>

      {/* ─── VERSION DESKTOP ─────────────────────────────── */}
      <div className="hidden lg:block space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/commandes" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nouvelle commande</h1>
            <p className="text-gray-500 mt-1">Créer une nouvelle commande</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Gauche */}
          <div className="col-span-2 space-y-6">
            {/* Infos */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Informations</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Client *</label>
                  <select
                    value={form.client_id}
                    onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    required
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date livraison *</label>
                  <input
                    type="date"
                    value={form.date_livraison}
                    onChange={e => setForm(f => ({ ...f, date_livraison: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Créneau</label>
                  <select
                    value={form.delivery_slot_id}
                    onChange={e => setForm(f => ({ ...f, delivery_slot_id: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Sans créneau</option>
                    {deliverySlots.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
                  <input
                    type="text"
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Note générale…"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Catalogue */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Ajouter des articles</h2>
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Rechercher un article…"
                    value={searchProduct}
                    onChange={e => setSearchProduct(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">Toutes catégories</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                {filteredArticles.slice(0, 30).map(article => {
                  const ref = article.product_reference;
                  const price = calculateArticlePrice(article, ref);
                  const atelierStyle = getAtelierStyle(ref.atelier);
                  const stateStyle = getProductStateStyle(article.product_state);
                  return (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => desktopAddArticle(article)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{article.display_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}>{atelierStyle.label}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}>{stateStyle.label}</span>
                          <span className="text-sm text-gray-500">{formatPrice(price)}</span>
                        </div>
                      </div>
                      <Plus size={20} className="text-blue-600" />
                    </button>
                  );
                })}
                {filteredArticles.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">Aucun article trouvé</div>
                )}
              </div>
            </div>

            {/* Lignes */}
            {lines.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900">Articles ({lines.length})</h2>
                <div className="space-y-3">
                  {lines.map(line => (
                    <div key={line.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{line.article_display_name}</p>
                        <p className="text-sm text-gray-500">{formatPrice(line.prix_unitaire)} / unité</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: Math.max(1, l.quantite - 1) } : l))} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg">−</button>
                        <input type="number" min="1" value={line.quantite} onChange={e => setLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: parseInt(e.target.value) || 1 } : l))} className="w-16 text-center px-2 py-1 border border-gray-200 rounded-lg" />
                        <button type="button" onClick={() => setLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: l.quantite + 1 } : l))} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg">+</button>
                      </div>
                      <div className="w-24 text-right font-medium">{formatPrice(line.quantite * line.prix_unitaire)}</div>
                      <button type="button" onClick={() => setLines(prev => prev.filter(l => l.id !== line.id))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Droite - Récap */}
          <div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 sticky top-8">
              <h2 className="font-semibold text-gray-900 mb-4">Récapitulatif</h2>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600"><span>Articles</span><span>{lines.length}</span></div>
                <div className="flex justify-between text-gray-600"><span>Quantité totale</span><span>{lines.reduce((s, l) => s + l.quantite, 0)}</span></div>
                <div className="pt-3 border-t border-gray-100 flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold">{formatPrice(total)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <button type="button" onClick={() => handleSubmit('confirmee')} disabled={submitting || !form.client_id || lines.length === 0} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle size={20} />
                  {submitting ? 'Enregistrement…' : 'Confirmer'}
                </button>
                <button type="button" onClick={() => handleSubmit('brouillon')} disabled={submitting || !form.client_id || lines.length === 0} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 disabled:opacity-50">
                  <Save size={20} />
                  Brouillon
                </button>
                <Link href="/commandes" className="w-full flex items-center justify-center px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl">Annuler</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
