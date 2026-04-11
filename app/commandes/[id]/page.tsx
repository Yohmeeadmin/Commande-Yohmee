'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  Copy,
  Printer,
  Trash2,
  CheckCircle,
  AlertCircle,
  Truck,
  Package,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { ORDER_STATUSES, OrderStatus } from '@/types';
import { formatDate, formatPrice } from '@/lib/utils';

interface OrderWithDetails {
  id: string;
  numero: string;
  client_id: string;
  delivery_date: string;
  delivery_slot_id: string | null;
  status: OrderStatus;
  note: string | null;
  total: number;
  delivered_at: string | null;
  is_fully_delivered: boolean;
  parent_order_id: string | null;
  order_type: string;
  recurring_order_id: string | null;
  created_at: string;
  client: {
    id: string;
    nom: string;
    contact_nom: string | null;
    telephone: string | null;
    adresse_livraison: string | null;
  };
  delivery_slot: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface OrderItemWithArticle {
  id: string;
  order_id: string;
  product_article_id: string;
  quantity_ordered: number;
  quantity_delivered: number | null;
  unit_price: number;
  article_unit_quantity: number;
  units_total: number;
  note: string | null;
  product_article: {
    id: string;
    display_name: string;
    pack_type: string;
    quantity: number;
    product_state: string;
    product_reference: {
      id: string;
      code: string;
      name: string;
      atelier: string;
    };
  };
}

export default function CommandeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [items, setItems] = useState<OrderItemWithArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [backorders, setBackorders] = useState<any[]>([]);

  useEffect(() => {
    loadOrder();
  }, [params.id]);

  async function loadOrder() {
    try {
      const [{ data: orderData }, { data: itemsData }] = await Promise.all([
        supabase
          .from('orders')
          .select('*, client:clients(*), delivery_slot:delivery_slots(*)')
          .eq('id', params.id)
          .single(),
        supabase
          .from('order_items')
          .select('*, product_article:product_articles(*, product_reference:product_references(*))')
          .eq('order_id', params.id)
          .order('created_at'),
      ]);

      setOrder(orderData as OrderWithDetails);
      setItems((itemsData as OrderItemWithArticle[]) || []);

      // Charger les commandes reliquat liées
      if (orderData) {
        const { data: backorderData } = await supabase
          .from('orders')
          .select('id, numero, delivery_date, status, total')
          .eq('parent_order_id', orderData.id)
          .order('delivery_date');
        setBackorders(backorderData || []);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    try {
      await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', order.id);

      setOrder({ ...order, status: newStatus });
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setUpdating(false);
    }
  }

  async function duplicateOrder() {
    if (!order) return;
    try {
      // Créer une nouvelle commande
      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert({
          client_id: order.client_id,
          delivery_date: new Date().toISOString().split('T')[0],
          delivery_slot_id: order.delivery_slot_id,
          note: order.note,
          status: 'brouillon',
        })
        .select()
        .single();

      if (error) throw error;

      // Copier les lignes
      await supabase.from('order_items').insert(
        items.map(item => ({
          order_id: newOrder.id,
          product_article_id: item.product_article_id,
          quantity_ordered: item.quantity_ordered,
          unit_price: item.unit_price,
          article_unit_quantity: item.article_unit_quantity,
          note: item.note,
        }))
      );

      router.push(`/commandes/${newOrder.id}`);
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la duplication');
    }
  }

  async function deleteOrder() {
    if (!order || !confirm('Supprimer cette commande ?')) return;
    try {
      await supabase.from('orders').delete().eq('id', order.id);
      router.push('/commandes');
      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
    }
  }

  // Livraison complète
  async function handleCompleteDelivery() {
    if (!order) return;
    try {
      await supabase.rpc('mark_order_delivered', {
        p_order_id: order.id,
        p_is_full_delivery: true,
      });
      loadOrder();
    } catch (error) {
      console.error('Erreur livraison complète:', error);
      alert('Erreur lors de la mise à jour');
    }
  }

  const getStatusStyle = (status: string) => {
    const s = ORDER_STATUSES.find(st => st.value === status);
    return s || { value: status, label: status, color: '#6B7280', bgColor: '#F3F4F6' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Commande non trouvée</p>
        <Link href="/commandes" className="text-blue-600 mt-2 inline-block">
          Retour aux commandes
        </Link>
      </div>
    );
  }

  const status = getStatusStyle(order.status);
  const client = order.client;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/commandes"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                Commande {order.numero}
              </h1>
              <span
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: status.bgColor, color: status.color }}
              >
                {status.label}
              </span>
            </div>
            <p className="text-gray-500 mt-1">
              Créée le {formatDate(order.created_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bouton livraison si en production ou confirmée */}
          {(order.status === 'confirmee' || order.status === 'production') && (
            <button
              onClick={handleCompleteDelivery}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
            >
              <Truck size={20} />
              Marquer livrée
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            title="Imprimer"
          >
            <Printer size={20} />
          </button>
          <button
            onClick={duplicateOrder}
            className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            title="Dupliquer"
          >
            <Copy size={20} />
          </button>
          <button
            onClick={deleteOrder}
            className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            title="Supprimer"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* Info commande reliquat (si c'est un reliquat) */}
      {order.order_type === 'reliquat' && order.parent_order_id && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Package className="text-amber-600" size={20} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-amber-800">Commande reliquat</p>
              <p className="text-sm text-amber-600">
                Suite à une livraison incomplète
              </p>
            </div>
            <Link
              href={`/commandes/${order.parent_order_id}`}
              className="inline-flex items-center gap-1 text-amber-700 font-medium hover:underline"
            >
              Voir l'original <ExternalLink size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* Info livraison (si livrée) */}
      {order.status === 'livree' && (
        <div className={`rounded-2xl p-4 ${
          order.is_fully_delivered
            ? 'bg-green-50 border border-green-200'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              order.is_fully_delivered ? 'bg-green-100' : 'bg-amber-100'
            }`}>
              {order.is_fully_delivered ? (
                <CheckCircle className="text-green-600" size={20} />
              ) : (
                <AlertCircle className="text-amber-600" size={20} />
              )}
            </div>
            <div>
              <p className={`font-medium ${
                order.is_fully_delivered ? 'text-green-800' : 'text-amber-800'
              }`}>
                {order.is_fully_delivered ? 'Livraison complète' : 'Livraison partielle'}
              </p>
              <p className={`text-sm ${
                order.is_fully_delivered ? 'text-green-600' : 'text-amber-600'
              }`}>
                {order.delivered_at && `Livrée le ${formatDate(order.delivered_at)}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Commandes reliquat liées */}
      {backorders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="font-medium text-blue-800 mb-3">
            {backorders.length} commande{backorders.length > 1 ? 's' : ''} reliquat
          </p>
          <div className="space-y-2">
            {backorders.map((bo) => {
              const boStatus = getStatusStyle(bo.status);
              return (
                <Link
                  key={bo.id}
                  href={`/commandes/${bo.id}`}
                  className="flex items-center justify-between p-3 bg-white rounded-xl hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{bo.numero}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: boStatus.bgColor, color: boStatus.color }}
                    >
                      {boStatus.label}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(bo.delivery_date)}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions statut */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-sm text-gray-500 mb-3">Changer le statut</p>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => updateStatus(s.value)}
              disabled={updating || order.status === s.value}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${
                order.status === s.value
                  ? 'ring-2 ring-offset-2'
                  : 'hover:opacity-80'
              }`}
              style={{
                backgroundColor: s.bgColor,
                color: s.color,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Infos commande et lignes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Livraison */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Livraison</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Calendar className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">{formatDate(order.delivery_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Clock className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Créneau</p>
                  <p className="font-medium text-gray-900">
                    {order.delivery_slot
                      ? `${order.delivery_slot.name} (${order.delivery_slot.start_time.slice(0,5)} - ${order.delivery_slot.end_time.slice(0,5)})`
                      : 'Non défini'}
                  </p>
                </div>
              </div>
            </div>
            {order.note && (
              <div className="mt-4 p-3 bg-amber-50 rounded-xl">
                <p className="text-sm text-amber-800">
                  <strong>Note :</strong> {order.note}
                </p>
              </div>
            )}
          </div>

          {/* Articles */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Articles ({items.length})</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map((item) => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                      <span className="font-bold text-gray-600">{item.quantity_ordered}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.product_article?.display_name || 'Article'}
                      </p>
                      {item.product_article?.product_reference && (
                        <p className="text-sm text-gray-400 font-mono">
                          {item.product_article.product_reference.code}
                        </p>
                      )}
                      {item.note && (
                        <p className="text-sm text-amber-600 mt-1">{item.note}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatPrice(item.quantity_ordered * item.unit_price)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatPrice(item.unit_price)} / unité
                    </p>
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

        {/* Sidebar - Client */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Client</h2>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">
                  {client?.nom?.charAt(0) || '?'}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{client?.nom || 'Client inconnu'}</p>
                {client?.contact_nom && (
                  <p className="text-sm text-gray-500">{client.contact_nom}</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {client?.telephone && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone size={16} className="text-gray-400" />
                  <a href={`tel:${client.telephone}`} className="hover:text-blue-600">
                    {client.telephone}
                  </a>
                </div>
              )}
              {client?.adresse_livraison && (
                <div className="flex items-start gap-3 text-gray-600">
                  <MapPin size={16} className="text-gray-400 mt-0.5" />
                  <span>{client.adresse_livraison}</span>
                </div>
              )}
            </div>

            <Link
              href={`/clients/${client?.id}`}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              <User size={18} />
              Voir le client
            </Link>
          </div>

          {/* Récurrence */}
          {order.recurring_order_id && (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-green-700">
                <AlertCircle size={20} />
                <span className="font-medium">Commande récurrente</span>
              </div>
              <p className="text-sm text-green-600 mt-1">
                Générée automatiquement depuis une récurrence
              </p>
              <Link
                href={`/recurrences/${order.recurring_order_id}`}
                className="text-sm text-green-700 font-medium mt-2 inline-block hover:underline"
              >
                Voir la récurrence →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
