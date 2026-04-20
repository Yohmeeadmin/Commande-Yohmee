'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, Search, CheckCircle, Bell, X, UserPlus, Clock, Calendar, AlertTriangle, GitMerge } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  Client, Category, ProductArticle, ProductReference,
  DeliverySlot, calculateArticlePrice, getProductStateStyle,
} from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { useAppSettings } from '@/lib/useAppSettings';
import { formatPrice, localDateStr } from '@/lib/utils';
import MobileFlow from '@/components/commandes/mobile/MobileFlow';
import type { ArticleWithRef, OrderLine, OrderForm } from '@/components/commandes/mobile/types';

export default function NouvelleCommandePage() {
  const router = useRouter();
  const { getStyle: getAtelierStyle } = useAteliers();
  const { settings } = useAppSettings();

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
    delivery_time: '',
    note: '',
    reminder_days: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [clientPrices, setClientPrices] = useState<Record<string, number>>({});

  // ─── Détection doublon ───────────────────────────────────
  const [duplicate, setDuplicate] = useState<{ id: string; numero: string; status: string; items: { product_article_id: string; quantity_ordered: number; unit_price: number; article_unit_quantity: number }[] } | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!form.client_id || !form.date_livraison) { setDuplicate(null); return; }
    let cancelled = false;
    supabase
      .from('orders')
      .select('id, numero, status, items:order_items(product_article_id, quantity_ordered, unit_price, article_unit_quantity)')
      .eq('client_id', form.client_id)
      .eq('delivery_date', form.date_livraison)
      .neq('status', 'annulee')
      .limit(1)
      .single()
      .then(({ data }: { data: any }) => { if (!cancelled) setDuplicate(data); });
    return () => { cancelled = true; };
  }, [form.client_id, form.date_livraison]);

  async function handleMerge() {
    if (!duplicate) return;
    setMerging(true);
    try {
      for (const line of lines) {
        const existing = duplicate.items.find(i => i.product_article_id === line.article_id);
        if (existing) {
          const { error } = await supabase.from('order_items')
            .update({ quantity_ordered: existing.quantity_ordered + line.quantite })
            .eq('order_id', duplicate.id)
            .eq('product_article_id', line.article_id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('order_items').insert({
            order_id: duplicate.id,
            product_article_id: line.article_id,
            quantity_ordered: line.quantite,
            unit_price: line.prix_unitaire,
            article_unit_quantity: line.unit_quantity,
          });
          if (error) throw error;
        }
      }
      router.push(`/commandes/${duplicate.id}`);
    } catch (err: any) {
      alert(`Erreur groupement : ${err?.message || 'inconnu'}`);
    } finally {
      setMerging(false);
    }
  }

  // ─── Desktop only ────────────────────────────────────────
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ nom: '', telephone: '' });
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [deliveryHint, setDeliveryHint] = useState<{ mode: 'heure' | 'creneau'; label: string } | null>(null);

  useEffect(() => { loadData(); }, []);

  // Charger les prix spéciaux du client sélectionné
  useEffect(() => {
    if (!form.client_id) { setClientPrices({}); return; }
    supabase
      .from('client_prices')
      .select('product_article_id, prix_special')
      .eq('client_id', form.client_id)
      .then(({ data }: { data: { product_article_id: string; prix_special: number }[] | null }) => {
        const map: Record<string, number> = {};
        (data || []).forEach(r => { map[r.product_article_id] = r.prix_special; });
        setClientPrices(map);
      });
  }, [form.client_id]);

  useEffect(() => {
    if (!form.client_id) { setDeliveryHint(null); return; }
    const client = clients.find(c => c.id === form.client_id);
    if (!client) { setDeliveryHint(null); return; }

    if (client.type_client === 'particulier') {
      // Particulier → heure de livraison
      const defaultTime = client.horaire_livraison || '';
      setForm(f => ({ ...f, delivery_slot_id: '', delivery_time: defaultTime }));
      setDeliveryHint({ mode: 'heure', label: '' });
    } else {
      // Entreprise → créneau (pré-sélection depuis les réglages si configuré)
      const typeCfg = settings.client_type_settings?.[client.type_client];
      const slotId = typeCfg?.mode === 'creneau' ? (typeCfg.creneau_id ?? '') : '';
      setForm(f => ({ ...f, delivery_slot_id: slotId, delivery_time: '' }));
      const slot = deliverySlots.find(s => s.id === slotId);
      setDeliveryHint({ mode: 'creneau', label: slot ? `${slot.name} (${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)})` : '' });
    }
  }, [form.client_id, clients, settings.client_type_settings, deliverySlots]);

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
          delivery_time: form.delivery_time || null,
          note: form.note || null,
          rappel: form.reminder_days !== null,
          reminder_days: form.reminder_days,
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

  // ─── Quick add client ────────────────────────────────────
  async function handleQuickAddClient() {
    if (!quickAddForm.nom.trim()) return;
    setQuickAddLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          nom: quickAddForm.nom.trim(),
          telephone: quickAddForm.telephone.trim() || null,
          type_client: 'autre',
          jours_livraison: [],
          is_active: true,
          note_interne: '⚠️ À compléter — créé rapidement depuis une commande',
        })
        .select()
        .single();
      if (error) throw error;
      setClients(prev => [...prev, data as Client].sort((a, b) => a.nom.localeCompare(b.nom)));
      setForm(f => ({ ...f, client_id: data.id }));
      setQuickAddOpen(false);
      setQuickAddForm({ nom: '', telephone: '' });
    } catch (err) {
      console.error('Erreur création client:', err);
    } finally {
      setQuickAddLoading(false);
    }
  }

  // ─── Desktop helpers ─────────────────────────────────────
  function desktopAddArticle(article: ArticleWithRef) {
    setLines(prev => {
      const existing = prev.find(l => l.article_id === article.id);
      const price = clientPrices[article.id] ?? calculateArticlePrice(article, article.product_reference);
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
          clientTypeSettings={settings.client_type_settings ?? {}}
          clientPrices={clientPrices}
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

        {/* Alerte doublon */}
        {duplicate && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-4">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-900">Commande déjà existante</p>
              <p className="text-sm text-amber-700 mt-0.5">
                La commande <span className="font-semibold">{duplicate.numero}</span> existe déjà pour ce client à cette date ({duplicate.items.length} article{duplicate.items.length > 1 ? 's' : ''}).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleMerge}
                disabled={merging || lines.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                <GitMerge size={15} />
                {merging ? 'Groupement…' : 'Grouper'}
              </button>
              <button
                onClick={() => router.push('/commandes')}
                className="px-4 py-2 border border-amber-200 text-amber-800 rounded-xl text-sm font-semibold hover:bg-amber-100 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Gauche */}
          <div className="col-span-2 space-y-6">
            {/* Infos */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Informations</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Client *</label>
                  <div className="flex gap-2">
                    <select
                      value={form.client_id}
                      onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      required
                    >
                      <option value="">Sélectionner un client</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setQuickAddOpen(true)}
                      className="px-3 py-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                      title="Ajouter un client rapidement"
                    >
                      <UserPlus size={20} />
                    </button>
                  </div>
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
                  {deliveryHint?.mode === 'heure' ? (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Clock size={14} className="text-purple-500" />
                        Heure de livraison
                      </label>
                      <input
                        type="time"
                        value={form.delivery_time}
                        onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))}
                        className="w-full px-4 py-3 border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Calendar size={14} className="text-blue-500" />
                        Créneau
                        {deliveryHint?.mode === 'creneau' && (
                          <span className="text-xs font-normal text-blue-500">— {deliveryHint.label}</span>
                        )}
                      </label>
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
                    </>
                  )}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Bell size={14} className="inline mr-1.5" />
                    Rappel client
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.reminder_days !== null}
                        onChange={e => setForm(f => ({ ...f, reminder_days: e.target.checked ? 1 : null }))}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span className="text-sm text-gray-700">Activer</span>
                    </label>
                    {form.reminder_days !== null && (
                      <select
                        value={form.reminder_days}
                        onChange={e => setForm(f => ({ ...f, reminder_days: parseInt(e.target.value) }))}
                        className="px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      >
                        <option value={1}>Veille (1 jour avant)</option>
                        <option value={2}>2 jours avant</option>
                        <option value={3}>3 jours avant</option>
                        <option value={5}>5 jours avant</option>
                        <option value={7}>1 semaine avant</option>
                      </select>
                    )}
                  </div>
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
      {/* Modale ajout rapide client */}
      {quickAddOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Nouveau client rapide</h3>
                <p className="text-xs text-gray-400 mt-0.5">À compléter plus tard dans Clients</p>
              </div>
              <button onClick={() => setQuickAddOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom / Société *</label>
                <input
                  type="text"
                  autoFocus
                  value={quickAddForm.nom}
                  onChange={e => setQuickAddForm(f => ({ ...f, nom: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAddClient()}
                  placeholder="Ex: Hôtel Atlas"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
                <input
                  type="tel"
                  value={quickAddForm.telephone}
                  onChange={e => setQuickAddForm(f => ({ ...f, telephone: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAddClient()}
                  placeholder="+212 6XX XXX XXX"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setQuickAddOpen(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleQuickAddClient}
                disabled={!quickAddForm.nom.trim() || quickAddLoading}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {quickAddLoading ? 'Création…' : 'Créer et sélectionner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
