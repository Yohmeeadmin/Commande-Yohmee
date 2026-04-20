'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, Phone, Copy, Printer,
  Trash2, CheckCircle, Truck, Pencil, X, Search, Plus,
  Save, Bell, Package, AlertCircle, ExternalLink, User, MapPin,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { ORDER_STATUSES, OrderStatus, calculateArticlePrice, getProductStateStyle } from '@/types';
import { formatDate, formatPrice } from '@/lib/utils';
import { useAteliers } from '@/lib/useAteliers';
import { useAppSettings } from '@/lib/useAppSettings';
import type { ArticleWithRef } from '@/components/commandes/mobile/types';

interface OrderWithDetails {
  id: string; numero: string; client_id: string;
  delivery_date: string; delivery_slot_id: string | null;
  delivery_time: string | null; status: OrderStatus;
  note: string | null; total: number; delivered_at: string | null;
  is_fully_delivered: boolean; parent_order_id: string | null;
  order_type: string; recurring_order_id: string | null; created_at: string;
  client: { id: string; nom: string; contact_nom: string | null; telephone: string | null; adresse_livraison: string | null; type_client: string; horaire_livraison: string | null };
  delivery_slot: { id: string; name: string; start_time: string; end_time: string } | null;
}

interface OrderItem {
  id: string; product_article_id: string; quantity_ordered: number;
  quantity_delivered: number | null; unit_price: number;
  article_unit_quantity: number; units_total: number; note: string | null;
  product_article: { id: string; display_name: string; pack_type: string; quantity: number; product_state: string; product_reference: { id: string; code: string; name: string; atelier: string } };
}

interface EditLine {
  id: string; article_id: string; article_display_name: string;
  quantite: number; prix_unitaire: number; unit_quantity: number;
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
  const [editOpen, setEditOpen] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // Edit state
  const [clients, setClients] = useState<Client[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);
  const [articles, setArticles] = useState<ArticleWithRef[]>([]);
  const [editForm, setEditForm] = useState({ client_id: '', delivery_date: '', delivery_slot_id: '', delivery_time: '', note: '' });
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [clientPrices, setClientPrices] = useState<Record<string, number>>({});

  useEffect(() => { loadOrder(); }, [params.id]);

  async function loadOrder() {
    const [{ data: orderData }, { data: itemsData }] = await Promise.all([
      supabase.from('orders').select('*, client:clients(*), delivery_slot:delivery_slots(*)').eq('id', params.id).single(),
      supabase.from('order_items').select('*, product_article:product_articles(*, product_reference:product_references(*))').eq('order_id', params.id).order('created_at'),
    ]);
    setOrder(orderData as OrderWithDetails);
    setItems((itemsData as OrderItem[]) || []);
    if (orderData) {
      const { data: boData } = await supabase.from('orders').select('id, numero, delivery_date, status, total').eq('parent_order_id', orderData.id).order('delivery_date');
      setBackorders(boData || []);
    }
    setLoading(false);
  }

  async function openEdit() {
    if (!order) return;
    const [{ data: clientsData }, { data: slotsData }, { data: articlesData }, { data: pricesData }] = await Promise.all([
      clients.length ? Promise.resolve({ data: clients }) : supabase.from('clients').select('id, nom, type_client, horaire_livraison').eq('is_active', true).order('nom'),
      deliverySlots.length ? Promise.resolve({ data: deliverySlots }) : supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order'),
      articles.length ? Promise.resolve({ data: articles }) : supabase.from('product_articles').select('*, product_reference:product_references(*)').eq('is_active', true).order('display_name'),
      supabase.from('client_prices').select('product_article_id, prix_special').eq('client_id', order.client_id),
    ]);
    const pricesMap: Record<string, number> = {};
    (pricesData || []).forEach((r: any) => { pricesMap[r.product_article_id] = r.prix_special; });
    setClientPrices(pricesMap);
    if (clientsData) setClients(clientsData as Client[]);
    if (slotsData) setDeliverySlots(slotsData as DeliverySlot[]);
    if (articlesData) setArticles(articlesData as ArticleWithRef[]);
    setEditForm({ client_id: order.client_id, delivery_date: order.delivery_date, delivery_slot_id: order.delivery_slot_id || '', delivery_time: order.delivery_time || '', note: order.note || '' });
    setEditLines(items.map(item => ({ id: item.id, article_id: item.product_article_id, article_display_name: item.product_article?.display_name || '', quantite: item.quantity_ordered, prix_unitaire: item.unit_price, unit_quantity: item.article_unit_quantity })));
    setSearchProduct('');
    setEditOpen(true);
  }

  function addArticle(article: ArticleWithRef) {
    setEditLines(prev => {
      const existing = prev.find(l => l.article_id === article.id);
      if (existing) return prev.map(l => l.article_id === article.id ? { ...l, quantite: l.quantite + 1 } : l);
      const price = clientPrices[article.id] ?? calculateArticlePrice(article, article.product_reference);
      return [...prev, { id: crypto.randomUUID(), article_id: article.id, article_display_name: article.display_name, quantite: 1, prix_unitaire: price, unit_quantity: article.quantity }];
    });
    setSearchProduct('');
  }

  async function handleSave() {
    if (!order || !editForm.client_id || editLines.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      const newTotal = editLines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

      const { error: updateError } = await supabase.from('orders').update({
        client_id: editForm.client_id,
        delivery_date: editForm.delivery_date,
        delivery_slot_id: editForm.delivery_slot_id || null,
        delivery_time: editForm.delivery_time || null,
        note: editForm.note || null,
        total: newTotal,
      }).eq('id', order.id);
      if (updateError) throw updateError;

      const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', order.id);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from('order_items').insert(
        editLines.map(l => ({ order_id: order.id, product_article_id: l.article_id, quantity_ordered: l.quantite, unit_price: l.prix_unitaire, article_unit_quantity: l.unit_quantity }))
      );
      if (insertError) throw insertError;

      await loadOrder();
      setEditOpen(false);
    } catch (err: any) {
      setSaveError(err?.message || 'Erreur lors de la modification');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(newStatus: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    try {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
      if (error) throw error;
      setOrder({ ...order, status: newStatus });
    } catch (err: any) {
      alert(`Erreur mise à jour statut : ${err?.message || 'inconnu'}`);
      await loadOrder();
    } finally {
      setUpdating(false);
    }
  }

  async function markDelivered() {
    if (!order) return;
    try {
      const { error } = await supabase.rpc('mark_order_delivered', { p_order_id: order.id, p_is_full_delivery: true });
      if (error) throw error;
      loadOrder();
    } catch (err: any) {
      alert(`Erreur livraison : ${err?.message || 'inconnu'}`);
    }
  }

  async function duplicateOrder() {
    if (!order) return;
    try {
      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({ client_id: order.client_id, delivery_date: new Date().toISOString().split('T')[0], delivery_slot_id: order.delivery_slot_id, note: order.note, status: 'brouillon' }).select().single();
      if (orderErr) throw orderErr;
      const { error: itemsErr } = await supabase.from('order_items').insert(items.map(item => ({ order_id: newOrder.id, product_article_id: item.product_article_id, quantity_ordered: item.quantity_ordered, unit_price: item.unit_price, article_unit_quantity: item.article_unit_quantity })));
      if (itemsErr) throw itemsErr;
      router.push(`/commandes/${newOrder.id}`);
    } catch (err: any) {
      alert(`Erreur duplication : ${err?.message || 'inconnu'}`);
    }
  }

  async function deleteOrder() {
    if (!order || !confirm('Supprimer cette commande ?')) return;
    try {
      const { error: itemsErr } = await supabase.from('order_items').delete().eq('order_id', order.id);
      if (itemsErr) throw itemsErr;
      const { error: orderErr } = await supabase.from('orders').delete().eq('id', order.id);
      if (orderErr) throw orderErr;
      router.push('/commandes');
    } catch (err: any) {
      alert(`Erreur suppression : ${err?.message || 'inconnu'}`);
    }
  }

  const getStatusStyle = (status: string) => ORDER_STATUSES.find(st => st.value === status) || { value: status, label: status, color: '#6B7280', bgColor: '#F3F4F6' };
  const filteredArticles = articles.filter(a => a.display_name.toLowerCase().includes(searchProduct.toLowerCase()) || a.product_reference?.name?.toLowerCase().includes(searchProduct.toLowerCase()) || a.product_reference?.code?.toLowerCase().includes(searchProduct.toLowerCase()));
  const editTotal = editLines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!order) return <div className="text-center py-12"><p className="text-gray-500">Commande non trouvée</p><Link href="/commandes" className="text-blue-600 mt-2 inline-block">Retour</Link></div>;

  const status = getStatusStyle(order.status);
  const client = order.client;
  const canEdit = order.status !== 'livree' && order.status !== 'annulee';
  const canDeliver = order.status === 'confirmee' || order.status === 'production';

  return (
    <>
    <div className="space-y-3 pb-24">

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Link href="/commandes" className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 flex-shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-bold text-gray-900 text-base">{order.numero}</h1>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: status.bgColor, color: status.color }}>
              {status.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Créée le {formatDate(order.created_at)}</p>
        </div>
        {/* Actions secondaires */}
        <button
          onClick={() => setShowActions(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 flex-shrink-0"
        >
          <span className="font-bold text-lg leading-none">⋯</span>
        </button>
      </div>

      {/* Bannière reliquat */}
      {order.order_type === 'reliquat' && order.parent_order_id && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="text-amber-600 flex-shrink-0" size={18} />
            <p className="text-sm font-medium text-amber-800">Commande reliquat</p>
          </div>
          <Link href={`/commandes/${order.parent_order_id}`} className="text-xs text-amber-700 font-semibold flex items-center gap-1">
            Original <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* Bannière livrée */}
      {order.status === 'livree' && (
        <div className={`rounded-2xl p-3 flex items-center gap-3 ${order.is_fully_delivered ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          {order.is_fully_delivered
            ? <CheckCircle className="text-green-600 flex-shrink-0" size={18} />
            : <AlertCircle className="text-amber-600 flex-shrink-0" size={18} />}
          <div>
            <p className={`text-sm font-semibold ${order.is_fully_delivered ? 'text-green-800' : 'text-amber-800'}`}>
              {order.is_fully_delivered ? 'Livraison complète' : 'Livraison partielle'}
            </p>
            {order.delivered_at && <p className={`text-xs ${order.is_fully_delivered ? 'text-green-600' : 'text-amber-600'}`}>Le {formatDate(order.delivered_at)}</p>}
          </div>
        </div>
      )}

      {/* Récurrences liées */}
      {order.recurring_order_id && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-blue-700">Commande récurrente</p>
          <Link href={`/recurrences/${order.recurring_order_id}`} className="text-xs text-blue-600 font-semibold">Voir →</Link>
        </div>
      )}

      {/* Client */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">{client?.nom?.charAt(0) || '?'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{client?.nom}</p>
            {client?.contact_nom && <p className="text-sm text-gray-400">{client.contact_nom}</p>}
          </div>
          <Link href={`/clients/${client?.id}`} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 flex-shrink-0">
            <User size={16} />
          </Link>
        </div>
        {(client?.telephone || client?.adresse_livraison) && (
          <div className="mt-3 space-y-2 pt-3 border-t border-gray-50">
            {client.telephone && (
              <a href={`tel:${client.telephone}`} className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={14} className="text-gray-400 flex-shrink-0" />
                {client.telephone}
              </a>
            )}
            {client.adresse_livraison && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                {client.adresse_livraison}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Livraison */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Calendar size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Date</p>
              <p className="font-semibold text-gray-900 text-sm">{formatDate(order.delivery_date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">{order.delivery_time ? 'Heure' : 'Créneau'}</p>
              <p className="font-semibold text-gray-900 text-sm">
                {order.delivery_time
                  ? order.delivery_time.slice(0, 5)
                  : order.delivery_slot
                    ? order.delivery_slot.name
                    : '—'}
              </p>
            </div>
          </div>
        </div>
        {order.note && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
              📝 {order.note}
            </p>
          </div>
        )}
      </div>

      {/* Changement statut */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Statut</p>
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {ORDER_STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => updateStatus(s.value)}
              disabled={updating}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all border"
              style={order.status === s.value
                ? { backgroundColor: s.color, color: 'white', borderColor: s.color }
                : { backgroundColor: s.bgColor, color: s.color, borderColor: s.bgColor }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <span className="font-semibold text-gray-900">Articles</span>
          <span className="text-sm text-gray-400">{items.length} référence{items.length > 1 ? 's' : ''}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {items.map(item => {
            const stateStyle = getProductStateStyle((item.product_article?.product_state || '') as any);
            const atelierStyle = item.product_article?.product_reference ? getAtelierStyle(item.product_article.product_reference.atelier) : null;
            return (
              <div key={item.id} className="flex items-center px-4 py-3 gap-3">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border border-gray-100">
                  <span className="text-lg font-black text-gray-900 leading-none">{item.quantity_ordered}</span>
                  <span className="text-gray-400 text-xs">lot{item.quantity_ordered > 1 ? 's' : ''}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{item.product_article?.display_name || 'Article'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {atelierStyle && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}>
                        {atelierStyle.label}
                      </span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}>
                      {stateStyle.label}
                    </span>
                  </div>
                  {item.note && <p className="text-xs text-amber-600 mt-1">{item.note}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-900 text-sm">{formatPrice(item.quantity_ordered * item.unit_price)}</p>
                  <p className="text-xs text-gray-400">{formatPrice(item.unit_price)}/u</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="font-semibold text-gray-700">Total</span>
          <span className="text-2xl font-black text-gray-900">{formatPrice(order.total)}</span>
        </div>
      </div>

      {/* Reliquats */}
      {backorders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Reliquats ({backorders.length})</p>
          <div className="space-y-2">
            {backorders.map(bo => {
              const boStatus = getStatusStyle(bo.status);
              return (
                <Link key={bo.id} href={`/commandes/${bo.id}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{bo.numero}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: boStatus.bgColor, color: boStatus.color }}>{boStatus.label}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(bo.delivery_date)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>

    {/* Barre d'actions fixe en bas */}
    {canEdit || canDeliver ? (
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100 px-4 py-3 flex gap-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 12px, 16px)' }}>
        {canEdit && (
          <button
            onClick={openEdit}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm active:bg-blue-700"
          >
            <Pencil size={16} /> Modifier
          </button>
        )}
        {canDeliver && (
          <button
            onClick={markDelivered}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm active:bg-emerald-600"
          >
            <Truck size={16} /> Livrer
          </button>
        )}
      </div>
    ) : null}

    {/* Menu actions secondaires */}
    {showActions && (
      <>
        <div className="fixed inset-0 bg-black/40 z-50 lg:hidden" onClick={() => setShowActions(false)} />
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl lg:hidden animate-slide-up"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 12px)' }}>
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />
          <div className="px-4 pb-2 space-y-1">
            <button onClick={() => { window.print(); setShowActions(false); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 active:bg-gray-100">
              <Printer size={20} className="text-gray-400" /> <span className="font-medium">Imprimer</span>
            </button>
            <button onClick={() => { duplicateOrder(); setShowActions(false); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 active:bg-gray-100">
              <Copy size={20} className="text-gray-400" /> <span className="font-medium">Dupliquer</span>
            </button>
            <button onClick={() => { setShowActions(false); deleteOrder(); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-red-600 active:bg-red-50">
              <Trash2 size={20} /> <span className="font-medium">Supprimer</span>
            </button>
          </div>
        </div>
      </>
    )}

    {/* Bottom sheet édition */}
    {editOpen && (
      <>
        <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setEditOpen(false)} />
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl flex flex-col animate-slide-up"
          style={{ maxHeight: '92vh', paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 12px)' }}>
          {/* Handle */}
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
            <div>
              <h2 className="font-bold text-gray-900">Modifier {order.numero}</h2>
              <p className="text-xs text-gray-400">{client?.nom}</p>
            </div>
            <button onClick={() => setEditOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100">
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          {/* Champs date / créneau / note — hors zone scroll pour fiabilité iOS */}
          <div className="px-5 py-4 space-y-3 border-b border-gray-100 flex-shrink-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date livraison</label>
                <input type="date" value={editForm.delivery_date} onChange={e => setEditForm(f => ({ ...f, delivery_date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {order.client?.type_client === 'particulier' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Horaire</label>
                  <input type="time" value={editForm.delivery_time} onChange={e => setEditForm(f => ({ ...f, delivery_time: e.target.value, delivery_slot_id: '' }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Créneau</label>
                  <select value={editForm.delivery_slot_id} onChange={e => setEditForm(f => ({ ...f, delivery_slot_id: e.target.value, delivery_time: '' }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— Aucun —</option>
                    {deliverySlots.map(s => <option key={s.id} value={s.id}>{s.name} {s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Note</label>
              <input type="text" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Note…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Articles — zone scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Recherche article */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ajouter un article</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input type="text" placeholder="Rechercher…" value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {searchProduct && <button onClick={() => setSearchProduct('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>}
              </div>
              {searchProduct && (
                <div className="mt-2 max-h-44 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50 bg-white">
                  {filteredArticles.slice(0, 15).map(article => {
                    const ref = article.product_reference;
                    const price = calculateArticlePrice(article, ref);
                    const atelierStyle = getAtelierStyle(ref.atelier);
                    return (
                      <button key={article.id} type="button" onClick={() => addArticle(article)}
                        className="w-full flex items-center justify-between px-3 py-2.5 active:bg-blue-50 text-left">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{article.display_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: atelierStyle.bgColor, color: atelierStyle.color }}>{atelierStyle.label}</span>
                            <span className="text-xs text-gray-400">{formatPrice(price)}</span>
                          </div>
                        </div>
                        <Plus size={16} className="text-blue-600 flex-shrink-0 ml-2" />
                      </button>
                    );
                  })}
                  {filteredArticles.length === 0 && <p className="text-center text-gray-400 text-sm py-4">Aucun article</p>}
                </div>
              )}
            </div>

            {/* Lignes */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Articles ({editLines.length})</label>
              <div className="space-y-2">
                {editLines.map(line => (
                  <div key={line.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{line.article_display_name}</p>
                      <p className="text-xs text-gray-400">{formatPrice(line.prix_unitaire)}/u · {formatPrice(line.quantite * line.prix_unitaire)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setEditLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: Math.max(1, l.quantite - 1) } : l))}
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 bg-white font-bold text-gray-700">−</button>
                      <span className="w-8 text-center font-bold text-gray-900 text-sm">{line.quantite}</span>
                      <button onClick={() => setEditLines(prev => prev.map(l => l.id === line.id ? { ...l, quantite: l.quantite + 1 } : l))}
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 bg-white font-bold text-gray-700">+</button>
                    </div>
                    <button onClick={() => setEditLines(prev => prev.filter(l => l.id !== line.id))} className="p-1.5 text-red-400 active:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <span className="font-semibold text-gray-600">Nouveau total</span>
              <span className="text-2xl font-black text-gray-900">{formatPrice(editTotal)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pt-2 pb-0 flex-shrink-0">
            {saveError && (
              <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {saveError}
              </div>
            )}
          </div>
          <div className="flex gap-3 px-5 py-3 border-t border-gray-100 flex-shrink-0">
            <button onClick={() => { setEditOpen(false); setSaveError(''); }} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-700 font-semibold text-sm">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !editForm.client_id || editLines.length === 0}
              className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </>
    )}
    </>
  );
}
