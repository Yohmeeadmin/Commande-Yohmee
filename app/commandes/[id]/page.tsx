'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, User, Phone, MapPin, Copy, Printer,
  Trash2, CheckCircle, AlertCircle, Truck, Package, ExternalLink,
  Pencil, X, Search, Plus, Save, Bell,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { ORDER_STATUSES, OrderStatus, calculateArticlePrice, getProductStateStyle } from '@/types';
import { formatDate, formatPrice } from '@/lib/utils';
import { useAteliers } from '@/lib/useAteliers';
import { useAppSettings } from '@/lib/useAppSettings';
import type { ArticleWithRef } from '@/components/commandes/mobile/types';

interface OrderWithDetails {
  id: string;
  numero: string;
  client_id: string;
  delivery_date: string;
  delivery_slot_id: string | null;
  delivery_time: string | null;
  status: OrderStatus;
  note: string | null;
  total: number;
  delivered_at: string | null;
  is_fully_delivered: boolean;
  parent_order_id: string | null;
  order_type: string;
  recurring_order_id: string | null;
  created_at: string;
  client: { id: string; nom: string; contact_nom: string | null; telephone: string | null; adresse_livraison: string | null; type_client: string; horaire_livraison: string | null };
  delivery_slot: { id: string; name: string; start_time: string; end_time: string } | null;
}

interface OrderItem {
  id: string;
  product_article_id: string;
  quantity_ordered: number;
  quantity_delivered: number | null;
  unit_price: number;
  article_unit_quantity: number;
  units_total: number;
  note: string | null;
  product_article: { id: string; display_name: string; pack_type: string; quantity: number; product_state: string; product_reference: { id: string; code: string; name: string; atelier: string } };
}

interface EditLine {
  id: string; // temp uuid pour le rendu
  article_id: string;
  article_display_name: string;
  quantite: number;
  prix_unitaire: number;
  unit_quantity: number;
}

interface DeliverySlot { id: string; name: string; start_time: string; end_time: string }
interface Client { id: string; nom: string; type_client: string; horaire_livraison: string | null }

export default function CommandeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getStyle: getAtelierStyle } = useAteliers();
  const { settings } = useAppSettings();

  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [backorders, setBackorders] = useState<any[]>([]);
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Edit state
  const [clients, setClients] = useState<Client[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);
  const [articles, setArticles] = useState<ArticleWithRef[]>([]);
  const [editForm, setEditForm] = useState({ client_id: '', delivery_date: '', delivery_slot_id: '', delivery_time: '', note: '' });
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [saving, setSaving] = useState(false);
  const [deliveryHint, setDeliveryHint] = useState<{ mode: 'heure' | 'creneau'; label: string } | null>(null);

  useEffect(() => { loadOrder(); }, [params.id]);

  // Réagit au changement de client dans le formulaire d'édition
  useEffect(() => {
    if (!editForm.client_id || !clients.length) return;
    const client = clients.find(c => c.id === editForm.client_id);
    if (!client) return;
    const typeCfg = settings.client_type_settings?.[client.type_client];
    if (!typeCfg) { setDeliveryHint(null); return; }
    if (typeCfg.mode === 'creneau') {
      const slotId = typeCfg.creneau_id ?? '';
      setEditForm(f => ({ ...f, delivery_slot_id: slotId, delivery_time: '' }));
      const slot = deliverySlots.find(s => s.id === slotId);
      setDeliveryHint({ mode: 'creneau', label: slot ? `${slot.name} (${slot.start_time.slice(0,5)}–${slot.end_time.slice(0,5)})` : '' });
    } else {
      const defaultTime = client.horaire_livraison || typeCfg.heure || '';
      setEditForm(f => ({ ...f, delivery_slot_id: '', delivery_time: f.delivery_time || defaultTime }));
      setDeliveryHint({ mode: 'heure', label: '' });
    }
  }, [editForm.client_id, clients, settings.client_type_settings, deliverySlots]);

  async function loadOrder() {
    const [{ data: orderData }, { data: itemsData }] = await Promise.all([
      supabase.from('orders').select('*, client:clients(*), delivery_slot:delivery_slots(*)').eq('id', params.id).single(),
      supabase.from('order_items').select('*, product_article:product_articles(*, product_reference:product_references(*))').eq('order_id', params.id).order('created_at'),
    ]);
    setOrder(orderData as OrderWithDetails);
    setItems((itemsData as OrderItem[]) || []);
    if (orderData) {
      const { data: backorderData } = await supabase.from('orders').select('id, numero, delivery_date, status, total').eq('parent_order_id', orderData.id).order('delivery_date');
      setBackorders(backorderData || []);
    }
    setLoading(false);
  }

  async function openEdit() {
    if (!order) return;
    // Charger les données nécessaires si pas encore fait
    const [{ data: clientsData }, { data: slotsData }, { data: articlesData }] = await Promise.all([
      clients.length ? Promise.resolve({ data: clients }) : supabase.from('clients').select('id, nom, type_client, horaire_livraison').eq('is_active', true).order('nom'),
      deliverySlots.length ? Promise.resolve({ data: deliverySlots }) : supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order'),
      articles.length ? Promise.resolve({ data: articles }) : supabase.from('product_articles').select('*, product_reference:product_references(*)').eq('is_active', true).order('display_name'),
    ]);
    if (clientsData) setClients(clientsData as Client[]);
    if (slotsData) setDeliverySlots(slotsData as DeliverySlot[]);
    if (articlesData) setArticles(articlesData as ArticleWithRef[]);

    setEditForm({
      client_id: order.client_id,
      delivery_date: order.delivery_date,
      delivery_slot_id: order.delivery_slot_id || '',
      delivery_time: order.delivery_time || '',
      note: order.note || '',
    });
    setEditLines(items.map(item => ({
      id: item.id,
      article_id: item.product_article_id,
      article_display_name: item.product_article?.display_name || '',
      quantite: item.quantity_ordered,
      prix_unitaire: item.unit_price,
      unit_quantity: item.article_unit_quantity,
    })));
    setDeliveryHint(null);
    setMode('edit');
  }

  function addArticle(article: ArticleWithRef) {
    setEditLines(prev => {
      const existing = prev.find(l => l.article_id === article.id);
      if (existing) return prev.map(l => l.article_id === article.id ? { ...l, quantite: l.quantite + 1 } : l);
      const price = calculateArticlePrice(article, article.product_reference);
      return [...prev, { id: crypto.randomUUID(), article_id: article.id, article_display_name: article.display_name, quantite: 1, prix_unitaire: price, unit_quantity: article.quantity }];
    });
    setSearchProduct('');
  }

  async function handleSave() {
    if (!order || !editForm.client_id || editLines.length === 0) return;
    setSaving(true);
    try {
      const newTotal = editLines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
      await supabase.from('orders').update({
        client_id: editForm.client_id,
        delivery_date: editForm.delivery_date,
        delivery_slot_id: editForm.delivery_slot_id || null,
        delivery_time: editForm.delivery_time || null,
        note: editForm.note || null,
        total: newTotal,
      }).eq('id', order.id);

      await supabase.from('order_items').delete().eq('order_id', order.id);
      await supabase.from('order_items').insert(editLines.map(l => ({
        order_id: order.id,
        product_article_id: l.article_id,
        quantity_ordered: l.quantite,
        unit_price: l.prix_unitaire,
        article_unit_quantity: l.unit_quantity,
      })));

      await loadOrder();
      setMode('view');
    } catch (err) {
      console.error('Erreur sauvegarde:', err);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(newStatus: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
    setOrder({ ...order, status: newStatus });
    setUpdating(false);
  }

  async function duplicateOrder() {
    if (!order) return;
    const { data: newOrder, error } = await supabase.from('orders').insert({ client_id: order.client_id, delivery_date: new Date().toISOString().split('T')[0], delivery_slot_id: order.delivery_slot_id, note: order.note, status: 'brouillon' }).select().single();
    if (error) { alert('Erreur duplication'); return; }
    await supabase.from('order_items').insert(items.map(item => ({ order_id: newOrder.id, product_article_id: item.product_article_id, quantity_ordered: item.quantity_ordered, unit_price: item.unit_price, article_unit_quantity: item.article_unit_quantity })));
    router.push(`/commandes/${newOrder.id}`);
  }

  async function deleteOrder() {
    if (!order || !confirm('Supprimer cette commande ?')) return;
    await supabase.from('order_items').delete().eq('order_id', order.id);
    await supabase.from('orders').delete().eq('id', order.id);
    router.push('/commandes');
  }

  async function handleCompleteDelivery() {
    if (!order) return;
    await supabase.rpc('mark_order_delivered', { p_order_id: order.id, p_is_full_delivery: true });
    loadOrder();
  }

  const getStatusStyle = (status: string) => ORDER_STATUSES.find(st => st.value === status) || { value: status, label: status, color: '#6B7280', bgColor: '#F3F4F6' };

  const filteredArticles = articles.filter(a => {
    const ref = a.product_reference;
    return a.display_name.toLowerCase().includes(searchProduct.toLowerCase()) ||
      ref?.name?.toLowerCase().includes(searchProduct.toLowerCase()) ||
      ref?.code?.toLowerCase().includes(searchProduct.toLowerCase());
  });

  const editTotal = editLines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!order) return <div className="text-center py-12"><p className="text-gray-500">Commande non trouvée</p><Link href="/commandes" className="text-blue-600 mt-2 inline-block">Retour</Link></div>;

  const status = getStatusStyle(order.status);
  const client = order.client;

  // ─── MODE ÉDITION ────────────────────────────────────────────────────────────
  if (mode === 'edit') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('view')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Modifier {order.numero}</h1>
              <p className="text-gray-500 mt-1">Modifiez et enregistrez</p>
            </div>
          </div>
          <button onClick={() => setMode('view')} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
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
                    value={editForm.client_id}
                    onChange={e => setEditForm(f => ({ ...f, client_id: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date livraison *</label>
                  <input
                    type="date"
                    value={editForm.delivery_date}
                    onChange={e => setEditForm(f => ({ ...f, delivery_date: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  {deliveryHint?.mode === 'heure' ? (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Clock size={14} className="text-purple-500" /> Heure de livraison
                      </label>
                      <input
                        type="time"
                        value={editForm.delivery_time}
                        onChange={e => setEditForm(f => ({ ...f, delivery_time: e.target.value }))}
                        className="w-full px-4 py-3 border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Calendar size={14} className="text-blue-500" /> Créneau
                        {deliveryHint?.mode === 'creneau' && deliveryHint.label && (
                          <span className="text-xs font-normal text-blue-500">— {deliveryHint.label}</span>
                        )}
                      </label>
                      <select
                        value={editForm.delivery_slot_id}
                        onChange={e => setEditForm(f => ({ ...f, delivery_slot_id: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Sans créneau</option>
                        {deliverySlots.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0,5)}–{s.end_time.slice(0,5)})</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
                  <input
                    type="text"
                    value={editForm.note}
                    onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Note générale…"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Catalogue */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Ajouter des articles</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Rechercher un article…"
                  value={searchProduct}
                  onChange={e => setSearchProduct(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {searchProduct && (
                <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {filteredArticles.slice(0, 20).map(article => {
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
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}>{atelierStyle.label}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}>{stateStyle.label}</span>
                            <span className="text-sm text-gray-500">{formatPrice(price)}</span>
                          </div>
                        </div>
                        <Plus size={20} className="text-blue-600" />
                      </button>
                    );
                  })}
                  {filteredArticles.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">Aucun article trouvé</div>}
                </div>
              )}
            </div>

            {/* Lignes */}
            {editLines.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                <h2 className="font-semibold text-gray-900">Articles ({editLines.length})</h2>
                <div className="space-y-3">
                  {editLines.map(line => (
                    <div key={line.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{line.article_display_name}</p>
                        <p className="text-sm text-gray-500">{formatPrice(line.prix_unitaire)} / unité</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setEditLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: Math.max(1, l.quantite - 1) } : l))} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg">−</button>
                        <input type="number" min="1" value={line.quantite} onChange={e => setEditLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: parseInt(e.target.value) || 1 } : l))} className="w-16 text-center px-2 py-1 border border-gray-200 rounded-lg" />
                        <button type="button" onClick={() => setEditLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: l.quantite + 1 } : l))} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg">+</button>
                      </div>
                      <div className="w-24 text-right font-medium">{formatPrice(line.quantite * line.prix_unitaire)}</div>
                      <button type="button" onClick={() => setEditLines(prev => prev.filter(l => l.id !== line.id))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
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
                <div className="flex justify-between text-gray-600"><span>Articles</span><span>{editLines.length}</span></div>
                <div className="flex justify-between text-gray-600"><span>Quantité totale</span><span>{editLines.reduce((s, l) => s + l.quantite, 0)}</span></div>
                <div className="pt-3 border-t border-gray-100 flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold">{formatPrice(editTotal)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !editForm.client_id || editLines.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={20} />
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button onClick={() => setMode('view')} className="w-full flex items-center justify-center px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── MODE VUE ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/commandes" className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={24} /></Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Commande {order.numero}</h1>
              <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: status.bgColor, color: status.color }}>{status.label}</span>
            </div>
            <p className="text-gray-500 mt-1">Créée le {formatDate(order.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(order.status === 'confirmee' || order.status === 'production') && (
            <button onClick={handleCompleteDelivery} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors">
              <Truck size={20} /> Marquer livrée
            </button>
          )}
          {order.status !== 'livree' && order.status !== 'annulee' && (
            <button onClick={openEdit} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
              <Pencil size={18} /> Modifier
            </button>
          )}
          <button onClick={() => window.print()} className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors" title="Imprimer"><Printer size={20} /></button>
          <button onClick={duplicateOrder} className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors" title="Dupliquer"><Copy size={20} /></button>
          <button onClick={deleteOrder} className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Supprimer"><Trash2 size={20} /></button>
        </div>
      </div>

      {order.order_type === 'reliquat' && order.parent_order_id && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Package className="text-amber-600" size={20} /></div>
            <div className="flex-1">
              <p className="font-medium text-amber-800">Commande reliquat</p>
              <p className="text-sm text-amber-600">Suite à une livraison incomplète</p>
            </div>
            <Link href={`/commandes/${order.parent_order_id}`} className="inline-flex items-center gap-1 text-amber-700 font-medium hover:underline">Voir l'original <ExternalLink size={16} /></Link>
          </div>
        </div>
      )}

      {order.status === 'livree' && (
        <div className={`rounded-2xl p-4 ${order.is_fully_delivered ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${order.is_fully_delivered ? 'bg-green-100' : 'bg-amber-100'}`}>
              {order.is_fully_delivered ? <CheckCircle className="text-green-600" size={20} /> : <AlertCircle className="text-amber-600" size={20} />}
            </div>
            <div>
              <p className={`font-medium ${order.is_fully_delivered ? 'text-green-800' : 'text-amber-800'}`}>{order.is_fully_delivered ? 'Livraison complète' : 'Livraison partielle'}</p>
              {order.delivered_at && <p className={`text-sm ${order.is_fully_delivered ? 'text-green-600' : 'text-amber-600'}`}>Livrée le {formatDate(order.delivered_at)}</p>}
            </div>
          </div>
        </div>
      )}

      {backorders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="font-medium text-blue-800 mb-3">{backorders.length} commande{backorders.length > 1 ? 's' : ''} reliquat</p>
          <div className="space-y-2">
            {backorders.map(bo => {
              const boStatus = getStatusStyle(bo.status);
              return (
                <Link key={bo.id} href={`/commandes/${bo.id}`} className="flex items-center justify-between p-3 bg-white rounded-xl hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{bo.numero}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: boStatus.bgColor, color: boStatus.color }}>{boStatus.label}</span>
                  </div>
                  <div className="text-sm text-gray-500">{formatDate(bo.delivery_date)}</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Statuts */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-sm text-gray-500 mb-3">Changer le statut</p>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map(s => (
            <button key={s.value} onClick={() => updateStatus(s.value)} disabled={updating || order.status === s.value}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${order.status === s.value ? 'ring-2 ring-offset-2' : 'hover:opacity-80'}`}
              style={{ backgroundColor: s.bgColor, color: s.color }}
            >{s.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Livraison */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Livraison</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><Calendar className="text-blue-600" size={20} /></div>
                <div><p className="text-sm text-gray-500">Date</p><p className="font-medium text-gray-900">{formatDate(order.delivery_date)}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><Clock className="text-blue-600" size={20} /></div>
                <div>
                  <p className="text-sm text-gray-500">{order.delivery_time ? 'Heure' : 'Créneau'}</p>
                  <p className="font-medium text-gray-900">
                    {order.delivery_time
                      ? order.delivery_time.slice(0, 5)
                      : order.delivery_slot
                        ? `${order.delivery_slot.name} (${order.delivery_slot.start_time.slice(0,5)}–${order.delivery_slot.end_time.slice(0,5)})`
                        : 'Non défini'}
                  </p>
                </div>
              </div>
            </div>
            {order.note && <div className="mt-4 p-3 bg-amber-50 rounded-xl"><p className="text-sm text-amber-800"><strong>Note :</strong> {order.note}</p></div>}
          </div>

          {/* Articles */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Articles ({items.length})</h2></div>
            <div className="divide-y divide-gray-50">
              {items.map(item => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center"><span className="font-bold text-gray-600">{item.quantity_ordered}</span></div>
                    <div>
                      <p className="font-medium text-gray-900">{item.product_article?.display_name || 'Article'}</p>
                      {item.product_article?.product_reference && <p className="text-sm text-gray-400 font-mono">{item.product_article.product_reference.code}</p>}
                      {item.note && <p className="text-sm text-amber-600 mt-1">{item.note}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{formatPrice(item.quantity_ordered * item.unit_price)}</p>
                    <p className="text-sm text-gray-500">{formatPrice(item.unit_price)} / unité</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-xl font-bold text-gray-900">{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar client */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Client</h2>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">{client?.nom?.charAt(0) || '?'}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{client?.nom || 'Client inconnu'}</p>
                {client?.contact_nom && <p className="text-sm text-gray-500">{client.contact_nom}</p>}
              </div>
            </div>
            <div className="space-y-3">
              {client?.telephone && <div className="flex items-center gap-3 text-gray-600"><Phone size={16} className="text-gray-400" /><a href={`tel:${client.telephone}`} className="hover:text-blue-600">{client.telephone}</a></div>}
              {client?.adresse_livraison && <div className="flex items-start gap-3 text-gray-600"><MapPin size={16} className="text-gray-400 mt-0.5" /><span>{client.adresse_livraison}</span></div>}
            </div>
            <Link href={`/clients/${client?.id}`} className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">
              <User size={18} /> Voir le client
            </Link>
          </div>

          {order.recurring_order_id && (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-green-700"><AlertCircle size={20} /><span className="font-medium">Commande récurrente</span></div>
              <p className="text-sm text-green-600 mt-1">Générée automatiquement depuis une récurrence</p>
              <Link href={`/recurrences/${order.recurring_order_id}`} className="text-sm text-green-700 font-medium mt-2 inline-block hover:underline">Voir la récurrence →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
