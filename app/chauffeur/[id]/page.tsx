'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Phone, MapPin, Package, CheckCircle, Truck, Navigation, ChevronRight, X, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, localDateStr } from '@/lib/utils';
import { DeliveryRouteWithDetails, ROUTE_STATUSES } from '@/types/delivery-routes';
import { useAppSettings } from '@/lib/useAppSettings';
import BLModal from '@/components/livraisons/BLModal';
import type { BLOrder } from '@/components/livraisons/BonLivraison';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Slot { id: string; name: string; start_time: string; end_time: string; }

interface OrderItem {
  id: string;
  quantity_ordered: number;
  quantity_delivered: number | null;
  unit_price: number;
  product_article: {
    display_name: string;
    product_reference: { vat_rate: number } | null;
  } | null;
}

interface DeliveryOrder {
  id: string;
  numero: string;
  status: string;
  total: number;
  note: string | null;
  delivery_slot: Slot | null;
  client: { nom: string; raison_sociale: string | null; telephone: string | null; adresse_livraison: string | null; code: string | null; ice: string | null } | null;
  items: OrderItem[];
}

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

function offsetDate(base: string, days: number) {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driverId = params.id as string;
  const routeId = searchParams.get('routeId');

  const { settings } = useAppSettings();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [route, setRoute] = useState<DeliveryRouteWithDetails | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [blOrder, setBlOrder] = useState<BLOrder | null>(null);

  // ── Modal BL ─────────────────────────────────────────────────────────────────
  const [blModalOrder, setBlModalOrder] = useState<DeliveryOrder | null>(null);
  const [blModalQtys, setBlModalQtys] = useState<Record<string, number>>({});
  const [blModalStep, setBlModalStep] = useState<1 | 2>(1);
  const [blBackorderDate, setBlBackorderDate] = useState('');
  const [blBackorderSlotId, setBlBackorderSlotId] = useState<string | null>(null);
  const [blConfirming, setBlConfirming] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Slots (pour le reliquat)
      const { data: slotsData } = await supabase
        .from('delivery_slots')
        .select('id, name, start_time, end_time')
        .eq('is_active', true)
        .order('sort_order');
      setSlots((slotsData as Slot[]) ?? []);

      // Chauffeur
      const { data: driverData } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, phone')
        .eq('id', driverId)
        .single();
      setDriver(driverData ?? null);

      // Tournée — par routeId si fourni, sinon la plus récente active du jour
      let routeQuery = supabase
        .from('delivery_routes')
        .select(`
          id, route_number, delivery_date, delivery_slot_id, driver_id, status,
          total_orders, total_revenue, notes, started_at, completed_at, created_at, updated_at,
          driver:drivers(first_name, last_name, phone),
          route_orders:delivery_route_orders(
            id, route_id, order_id, assigned_at, delivery_order_index,
            order_amount_snapshot, original_slot_id, is_out_of_slot, status, created_at
          )
        `);

      if (routeId) {
        routeQuery = routeQuery.eq('id', routeId);
      } else {
        routeQuery = routeQuery
          .eq('driver_id', driverId)
          .eq('delivery_date', localDateStr())
          .not('status', 'eq', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1);
      }

      const { data: routeData } = await routeQuery.maybeSingle();
      const loadedRoute = (routeData as DeliveryRouteWithDetails | null) ?? null;
      setRoute(loadedRoute);

      // Commandes depuis les IDs de la tournée
      if (loadedRoute && loadedRoute.route_orders.length > 0) {
        const orderIds = loadedRoute.route_orders
          .filter(ro => ro.status !== 'cancelled')
          .map(ro => ro.order_id);
        const { data } = await supabase
          .from('orders')
          .select(`
            id, numero, status, total, note,
            delivery_slot:delivery_slots(id, name, start_time, end_time),
            client:clients(nom, raison_sociale, telephone, adresse_livraison, code, ice),
            items:order_items(id, quantity_ordered, quantity_delivered, unit_price, product_article:product_articles(display_name, product_reference:product_references(vat_rate)))
          `)
          .in('id', orderIds)
          .not('status', 'eq', 'annulee');
        setOrders((data as DeliveryOrder[]) ?? []);
      } else {
        // Fallback : commandes du jour assignées au chauffeur
        const { data } = await supabase
          .from('orders')
          .select(`
            id, numero, status, total, note,
            delivery_slot:delivery_slots(id, name, start_time, end_time),
            client:clients(nom, raison_sociale, telephone, adresse_livraison, code, ice),
            items:order_items(id, quantity_ordered, quantity_delivered, unit_price, product_article:product_articles(display_name, product_reference:product_references(vat_rate)))
          `)
          .eq('delivery_date', localDateStr())
          .eq('driver_id', driverId)
          .not('status', 'eq', 'annulee');
        setOrders((data as DeliveryOrder[]) ?? []);
      }

      setLoading(false);
    }
    load();
  }, [driverId, routeId]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  // Camion : confirme la livraison directement, sans modal
  async function confirmDelivery(order: DeliveryOrder) {
    await supabase.rpc('mark_order_delivered', {
      p_order_id: order.id,
      p_is_fully_delivered: true,
      p_delivered_items: null,
    });
    setOrders(prev => prev.map(o =>
      o.id === order.id
        ? { ...o, status: 'livree', items: o.items.map(i => ({ ...i, quantity_delivered: i.quantity_ordered })) }
        : o
    ));
  }

  // BL : ouvre le modal de quantités
  function openBLModal(order: DeliveryOrder) {
    const qtys: Record<string, number> = {};
    order.items.forEach(item => { qtys[item.id] = item.quantity_ordered; });
    setBlModalQtys(qtys);
    setBlModalStep(1);
    setBlBackorderDate(offsetDate(localDateStr(), 1));
    setBlBackorderSlotId(order.delivery_slot?.id ?? null);
    setBlModalOrder(order);
  }

  function closeBLModal() {
    setBlModalOrder(null);
    setBlModalStep(1);
  }

  async function confirmBL(createBackorder: boolean) {
    if (!blModalOrder) return;
    setBlConfirming(true);
    try {
      if (createBackorder) {
        const remainingItems = blModalOrder.items
          .filter(item => (blModalQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered)
          .map(item => ({
            product_article_id: (item as any).product_article_id,
            quantity: item.quantity_ordered - (blModalQtys[item.id] ?? item.quantity_ordered),
            unit_price: item.unit_price,
            article_unit_quantity: (item as any).article_unit_quantity ?? 1,
          }));
        if (remainingItems.length > 0) {
          const { data: newOrderId } = await supabase.rpc('create_backorder', {
            p_parent_order_id: blModalOrder.id,
            p_new_delivery_date: blBackorderDate,
            p_items: remainingItems,
          });
          if (newOrderId && blBackorderSlotId !== blModalOrder.delivery_slot?.id) {
            await supabase.from('orders').update({ delivery_slot_id: blBackorderSlotId }).eq('id', newOrderId);
          }
        }
      }
      const bl: BLOrder = {
        numero: blModalOrder.numero.replace(/^CMD-/, 'BL-'),
        delivery_date: localDateStr(),
        logoUrl: settings.logo_url,
        company: {
          raison_sociale: settings.raison_sociale,
          adresse_siege: settings.adresse_siege,
          code_postal: settings.code_postal,
          ville_siege: settings.ville_siege,
          telephone_societe: settings.telephone_societe,
          email_societe: settings.email_societe,
          site_web: settings.site_web,
          rc: settings.rc,
          if_fiscal: settings.if_fiscal,
          ice_societe: settings.ice_societe,
          tp: settings.tp,
          cnss: settings.cnss,
        },
        client: {
          nom: blModalOrder.client?.nom ?? '—',
          raison_sociale: blModalOrder.client?.raison_sociale ?? null,
          code: blModalOrder.client?.code ?? null,
          ice: blModalOrder.client?.ice ?? null,
          adresse_livraison: blModalOrder.client?.adresse_livraison ?? null,
        },
        items: blModalOrder.items
          .filter(item => (blModalQtys[item.id] ?? item.quantity_ordered) > 0)
          .map(item => ({
            display_name: item.product_article?.display_name ?? '—',
            vat_rate: item.product_article?.product_reference?.vat_rate ?? 20,
            unit_price: item.unit_price,
            quantity: blModalQtys[item.id] ?? item.quantity_ordered,
          })),
      };
      // Sauvegarde en base
      await supabase.from('bons_livraison').insert({
        numero: bl.numero,
        order_id: blModalOrder.id,
        client_nom: bl.client.nom,
        delivery_date: bl.delivery_date,
        items: bl.items,
      });
      setBlOrder(bl);
      closeBLModal();
    } finally {
      setBlConfirming(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p className="font-medium">Chauffeur introuvable</p>
      </div>
    );
  }

  const stops = route
    ? route.route_orders
        .slice()
        .sort((a, b) => (a.delivery_order_index ?? 0) - (b.delivery_order_index ?? 0))
        .map(ro => orders.find(o => o.id === ro.order_id))
        .filter((o): o is DeliveryOrder => !!o)
    : orders.slice().sort((a, b) => a.numero.localeCompare(b.numero));

  const delivered = stops.filter(o => o.status === 'livree').length;
  const statusInfo = route ? ROUTE_STATUSES.find(s => s.value === route.status) : null;

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 pb-4 sticky top-0 z-10">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-3 pt-4">
              <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {driver.first_name.charAt(0)}{driver.last_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-lg leading-none">
                  {driver.first_name} {driver.last_name}
                </p>
                {driver.phone && (
                  <a href={`tel:${driver.phone}`} className="text-sm text-blue-600 flex items-center gap-1 mt-0.5">
                    <Phone size={11} /> {driver.phone}
                  </a>
                )}
              </div>
              {statusInfo && (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
                >
                  {statusInfo.label}
                </span>
              )}
            </div>

            {stops.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Navigation size={11} />
                    {route ? route.route_number : 'Livraisons du jour'}
                  </span>
                  <span className="font-semibold text-gray-700">{delivered}/{stops.length} livrées</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(delivered / stops.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Liste des arrêts */}
        <div className="max-w-lg mx-auto p-4 space-y-3">
          {stops.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <Package className="mx-auto text-gray-300 mb-3" size={36} />
              <p className="text-gray-500 font-medium">Aucune livraison</p>
            </div>
          ) : (
            stops.map((order, idx) => {
              const isDelivered = order.status === 'livree';
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border overflow-hidden ${isDelivered ? 'border-green-100' : 'border-gray-100'}`}
                >
                  <div className={`px-4 py-4 ${isDelivered ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 pt-0.5">
                        {isDelivered ? (
                          <CheckCircle size={22} className="text-green-500" />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-gray-900 text-white text-sm font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-base leading-tight ${isDelivered ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {order.client?.nom ?? '—'}
                        </p>

                        {order.client?.telephone && (
                          <a href={`tel:${order.client.telephone}`} className="text-sm text-blue-600 flex items-center gap-1.5 mt-1.5">
                            <Phone size={13} /> {order.client.telephone}
                          </a>
                        )}

                        {order.client?.adresse_livraison && (
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(order.client.adresse_livraison)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5"
                          >
                            <MapPin size={13} className="shrink-0 text-gray-400" />
                            <span className="underline">{order.client.adresse_livraison}</span>
                            <ChevronRight size={11} className="text-gray-400 shrink-0" />
                          </a>
                        )}

                        {order.note && (
                          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-2">
                            ⚠ {order.note}
                          </p>
                        )}

                        <ul className="mt-2.5 space-y-1">
                          {order.items.map(item => (
                            <li key={item.id} className="text-sm text-gray-600 flex items-baseline gap-1.5">
                              <span className="text-gray-300 text-xs">•</span>
                              <span>{item.product_article?.display_name ?? '—'}</span>
                              <span className="font-bold text-gray-800">×{item.quantity_ordered}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="flex items-center justify-between mt-3">
                          <p className="text-sm font-bold text-gray-800">{formatPrice(order.total)}</p>
                          {!isDelivered && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openBLModal(order)}
                                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
                              >
                                <FileText size={14} /> BL
                              </button>
                              <button
                                onClick={() => confirmDelivery(order)}
                                className="flex items-center justify-center w-10 h-10 bg-green-600 text-white rounded-xl hover:bg-green-700 active:scale-95 transition-all"
                              >
                                <Truck size={18} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── BL Modal ─────────────────────────────────────────────────────────── */}
      {blOrder && (
        <BLModal
          orders={[blOrder]}
          title={`BL — ${blOrder.client.nom}`}
          onClose={() => setBlOrder(null)}
        />
      )}

      {/* ── Modal BL quantités ─────────────────────────────────────────────────── */}
      {blModalOrder && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">{blModalStep === 1 ? 'Quantités livrées' : 'Reliquat non livré'}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{blModalOrder.client?.nom ?? blModalOrder.numero}</p>
              </div>
              <button onClick={closeBLModal} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X size={20} /></button>
            </div>

            {blModalStep === 1 ? (
              <>
                <div className="px-5 py-4 space-y-3">
                  {blModalOrder.items.map(item => {
                    const qty = blModalQtys[item.id] ?? item.quantity_ordered;
                    const isShort = qty < item.quantity_ordered;
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <p className={`flex-1 text-sm ${isShort ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>{item.product_article?.display_name ?? '—'}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">sur {item.quantity_ordered}</span>
                          <input type="number" min={0} max={item.quantity_ordered} value={qty}
                            onChange={e => setBlModalQtys(prev => ({ ...prev, [item.id]: Math.min(item.quantity_ordered, Math.max(0, parseInt(e.target.value) || 0)) }))}
                            className={`w-20 text-center border rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none ${isShort ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 py-4 border-t border-gray-100" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
                  <button
                    onClick={() => {
                      const isPartial = blModalOrder.items.some(item => (blModalQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered);
                      if (isPartial) setBlModalStep(2); else confirmBL(false);
                    }}
                    disabled={blConfirming}
                    className="w-full px-4 py-3.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Confirmer le BL
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 space-y-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Articles non livrés</p>
                    {blModalOrder.items.filter(item => (blModalQtys[item.id] ?? item.quantity_ordered) < item.quantity_ordered).map(item => (
                      <p key={item.id} className="text-sm text-amber-800">
                        {item.product_article?.display_name ?? '—'}<span className="font-bold ml-1">×{item.quantity_ordered - (blModalQtys[item.id] ?? item.quantity_ordered)}</span>
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date du reliquat</p>
                    <input type="date" value={blBackorderDate} min={localDateStr()} onChange={e => setBlBackorderDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-blue-400" />
                  </div>
                  {slots.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Créneau</p>
                      <div className="flex flex-wrap gap-2">
                        {slots.map(s => (
                          <button key={s.id} onClick={() => setBlBackorderSlotId(s.id)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${blBackorderSlotId === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {s.name} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </button>
                        ))}
                        <button onClick={() => setBlBackorderSlotId(null)}
                          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${blBackorderSlotId === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          Sans créneau
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 px-5 py-4 border-t border-gray-100" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
                  <button onClick={() => confirmBL(false)} disabled={blConfirming}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                    Sans reliquat
                  </button>
                  <button onClick={() => confirmBL(true)} disabled={blConfirming || !blBackorderDate}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
                    {blConfirming ? 'En cours…' : 'Confirmer le BL →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
