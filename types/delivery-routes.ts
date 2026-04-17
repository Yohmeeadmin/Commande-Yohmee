// ============================================
// DELIVERY ROUTES — Types TypeScript
// ============================================

export type RouteStatus =
  | 'draft'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'partially_delivered'
  | 'cancelled';

export const ROUTE_STATUSES: {
  value: RouteStatus;
  label: string;
  color: string;
  bgColor: string;
}[] = [
  { value: 'draft',               label: 'Brouillon',  color: '#6B7280', bgColor: '#F3F4F6' },
  { value: 'assigned',            label: 'Assignée',   color: '#2563EB', bgColor: '#DBEAFE' },
  { value: 'in_progress',         label: 'En cours',   color: '#D97706', bgColor: '#FEF3C7' },
  { value: 'completed',           label: 'Terminée',   color: '#059669', bgColor: '#D1FAE5' },
  { value: 'partially_delivered', label: 'Partielle',  color: '#7C3AED', bgColor: '#EDE9FE' },
  { value: 'cancelled',           label: 'Annulée',    color: '#DC2626', bgColor: '#FEE2E2' },
];

// ── Tables DB ─────────────────────────────────────────────────────────────────

/**
 * delivery_routes
 *
 * CREATE TABLE delivery_routes (
 *   id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   route_number      TEXT NOT NULL,
 *   delivery_date     DATE NOT NULL,
 *   delivery_slot_id  UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
 *   driver_id         UUID REFERENCES drivers(id) ON DELETE SET NULL,
 *   status            TEXT NOT NULL DEFAULT 'draft'
 *                       CHECK (status IN ('draft','assigned','in_progress','completed','partially_delivered','cancelled')),
 *   total_orders      INTEGER NOT NULL DEFAULT 0,
 *   total_revenue     NUMERIC(10,2) NOT NULL DEFAULT 0,
 *   notes             TEXT,
 *   started_at        TIMESTAMPTZ,
 *   completed_at      TIMESTAMPTZ,
 *   created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_delivery_routes_date   ON delivery_routes(delivery_date);
 * CREATE INDEX idx_delivery_routes_driver ON delivery_routes(driver_id);
 * CREATE INDEX idx_delivery_routes_slot   ON delivery_routes(delivery_slot_id);
 * CREATE INDEX idx_delivery_routes_status ON delivery_routes(status);
 */
export interface DeliveryRoute {
  id: string;
  route_number: string;
  delivery_date: string;
  delivery_slot_id: string | null;
  driver_id: string | null;
  status: RouteStatus;
  total_orders: number;
  total_revenue: number;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * delivery_route_orders
 *
 * CREATE TABLE delivery_route_orders (
 *   id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   route_id                UUID NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
 *   order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 *   assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   delivery_order_index    INTEGER,
 *   order_amount_snapshot   NUMERIC(10,2),
 *   original_slot_id        UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
 *   is_out_of_slot          BOOLEAN NOT NULL DEFAULT FALSE,
 *   status                  TEXT NOT NULL DEFAULT 'pending',
 *   created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_dro_route ON delivery_route_orders(route_id);
 * CREATE INDEX idx_dro_order ON delivery_route_orders(order_id);
 * -- Une commande active ne peut appartenir qu'à une seule tournée :
 * CREATE UNIQUE INDEX idx_dro_unique_active_order
 *   ON delivery_route_orders(order_id)
 *   WHERE status != 'cancelled';
 */
export interface DeliveryRouteOrder {
  id: string;
  route_id: string;
  order_id: string;
  assigned_at: string;
  delivery_order_index: number | null;
  order_amount_snapshot: number | null;
  original_slot_id: string | null;
  is_out_of_slot: boolean;
  status: string;
  created_at: string;
}

// ── Jointures ─────────────────────────────────────────────────────────────────

export interface DeliveryRouteDriver {
  first_name: string;
  last_name: string;
  phone: string | null;
}

export interface DeliveryRouteWithDetails extends DeliveryRoute {
  driver: DeliveryRouteDriver | null;
  route_orders: DeliveryRouteOrder[];
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface RouteAnalytics {
  totalRoutes: number;
  avgCAPerRoute: number;
  avgOrdersPerRoute: number;
  deliveryRate: number;      // % tournées terminées
  outOfSlotOrders: number;   // commandes hors créneau initial
}

export interface DriverRouteStats {
  driverId: string;
  driverName: string;
  totalRoutes: number;
  totalCA: number;
  totalOrders: number;
  avgCAPerRoute: number;
  avgOrdersPerRoute: number;
}

export interface SlotRouteStats {
  slotId: string | null;
  slotName: string;
  totalRoutes: number;
  totalCA: number;
  totalOrders: number;
  deliveryRate: number;
}

export interface OutOfSlotAnalytics {
  total: number;      // Total commandes hors créneau
  advanced: number;   // Livrées avant leur créneau initial (créneau route avant créneau order)
  delayed: number;    // Livrées après leur créneau initial
}
