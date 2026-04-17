import {
  DeliveryRouteWithDetails,
  RouteAnalytics,
  DriverRouteStats,
  SlotRouteStats,
  OutOfSlotAnalytics,
} from '@/types/delivery-routes';

// ── Fonctions analytiques tournées ────────────────────────────────────────────

/**
 * Métriques globales pour un ensemble de tournées.
 */
export function computeRouteAnalytics(
  routes: DeliveryRouteWithDetails[],
): RouteAnalytics {
  const active = routes.filter(r => r.status !== 'cancelled');
  const total = active.length;
  if (total === 0) {
    return { totalRoutes: 0, avgCAPerRoute: 0, avgOrdersPerRoute: 0, deliveryRate: 0, outOfSlotOrders: 0 };
  }

  const totalCA     = active.reduce((s, r) => s + r.total_revenue, 0);
  const totalOrders = active.reduce((s, r) => s + r.total_orders, 0);
  const completed   = active.filter(r => r.status === 'completed' || r.status === 'partially_delivered').length;
  const outOfSlot   = active.flatMap(r => r.route_orders).filter(ro => ro.is_out_of_slot).length;

  return {
    totalRoutes:       total,
    avgCAPerRoute:     totalCA / total,
    avgOrdersPerRoute: totalOrders / total,
    deliveryRate:      completed / total,
    outOfSlotOrders:   outOfSlot,
  };
}

/**
 * CA et performance par chauffeur.
 */
export function computeDriverStats(
  routes: DeliveryRouteWithDetails[],
): DriverRouteStats[] {
  const map = new Map<string, DriverRouteStats>();

  routes
    .filter(r => r.status !== 'cancelled' && r.driver_id)
    .forEach(route => {
      const id   = route.driver_id!;
      const name = route.driver
        ? `${route.driver.first_name} ${route.driver.last_name}`
        : 'Inconnu';

      const prev = map.get(id) ?? {
        driverId: id, driverName: name,
        totalRoutes: 0, totalCA: 0, totalOrders: 0,
        avgCAPerRoute: 0, avgOrdersPerRoute: 0,
      };

      map.set(id, {
        ...prev,
        totalRoutes: prev.totalRoutes + 1,
        totalCA:     prev.totalCA + route.total_revenue,
        totalOrders: prev.totalOrders + route.total_orders,
      });
    });

  return Array.from(map.values()).map(s => ({
    ...s,
    avgCAPerRoute:     s.totalRoutes > 0 ? s.totalCA / s.totalRoutes : 0,
    avgOrdersPerRoute: s.totalRoutes > 0 ? s.totalOrders / s.totalRoutes : 0,
  }));
}

/**
 * CA et taux de livraison par créneau.
 * slotNames: Map<slotId, label affiché>
 */
export function computeSlotStats(
  routes: DeliveryRouteWithDetails[],
  slotNames: Map<string, string>,
): SlotRouteStats[] {
  const map = new Map<string, SlotRouteStats>();

  routes
    .filter(r => r.status !== 'cancelled')
    .forEach(route => {
      const key      = route.delivery_slot_id ?? '__none__';
      const slotName = route.delivery_slot_id
        ? (slotNames.get(route.delivery_slot_id) ?? route.delivery_slot_id)
        : 'Sans créneau';

      const prev = map.get(key) ?? {
        slotId: route.delivery_slot_id,
        slotName, totalRoutes: 0, totalCA: 0, totalOrders: 0, deliveryRate: 0,
      };

      const done = route.status === 'completed' || route.status === 'partially_delivered' ? 1 : 0;
      const newTotal = prev.totalRoutes + 1;

      map.set(key, {
        ...prev,
        totalRoutes: newTotal,
        totalCA:     prev.totalCA + route.total_revenue,
        totalOrders: prev.totalOrders + route.total_orders,
        // Moyenne glissante du taux de livraison
        deliveryRate: (prev.deliveryRate * prev.totalRoutes + done) / newTotal,
      });
    });

  return Array.from(map.values()).sort((a, b) => b.totalCA - a.totalCA);
}

/**
 * Analyse des commandes livrées hors créneau initial.
 *
 * Pour déterminer si une commande a été avancée ou décalée, on compare
 * l'heure de début du créneau de la tournée avec l'heure de début du
 * créneau initial de la commande.
 *
 * slotStartTimes: Map<slotId, start_time "HH:MM">
 */
export function analyseOutOfSlotOrders(
  routes: DeliveryRouteWithDetails[],
  slotStartTimes: Map<string, string>,
): OutOfSlotAnalytics {
  const outOfSlot = routes
    .filter(r => r.status !== 'cancelled')
    .flatMap(r =>
      r.route_orders
        .filter(ro => ro.is_out_of_slot)
        .map(ro => ({
          routeSlotId:    r.delivery_slot_id,
          originalSlotId: ro.original_slot_id,
        }))
    );

  let advanced = 0;
  let delayed  = 0;

  outOfSlot.forEach(({ routeSlotId, originalSlotId }) => {
    if (!routeSlotId || !originalSlotId) return;
    const routeTime    = slotStartTimes.get(routeSlotId);
    const originalTime = slotStartTimes.get(originalSlotId);
    if (!routeTime || !originalTime) return;
    if (routeTime < originalTime) advanced++;
    else if (routeTime > originalTime) delayed++;
  });

  return { total: outOfSlot.length, advanced, delayed };
}

/**
 * Taux de livraison par tournée individuelle.
 * ordersDelivered: Map<orderId, boolean>
 */
export function computeRouteDeliveryRate(
  route: DeliveryRouteWithDetails,
  ordersDelivered: Map<string, boolean>,
): number {
  const total = route.route_orders.length;
  if (total === 0) return 0;
  const delivered = route.route_orders.filter(ro => ordersDelivered.get(ro.order_id)).length;
  return delivered / total;
}
