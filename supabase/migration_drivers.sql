-- ============================================
-- BDK COMMANDES — MIGRATION CHAUFFEURS
-- ============================================

-- ============================================
-- 1. TABLE DRIVERS
-- ============================================

CREATE TABLE IF NOT EXISTS drivers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT        NOT NULL,
  last_name  TEXT        NOT NULL,
  phone      TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(is_active);

-- ============================================
-- 2. COLONNES SUPPLÉMENTAIRES SUR ORDERS
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS driver_id       UUID    REFERENCES drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_sequence INTEGER CHECK (driver_sequence IS NULL OR driver_sequence > 0);

CREATE INDEX IF NOT EXISTS idx_orders_driver    ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_dt ON orders(delivery_date, driver_id);

-- ============================================
-- 3. CONTRAINTES D'UNICITÉ
-- (index partiels pour gérer les NULL correctement)
-- ============================================

-- Cas 1 : commande avec créneau défini
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_driver_seq_with_slot
  ON orders(delivery_date, delivery_slot_id, driver_id, driver_sequence)
  WHERE driver_id IS NOT NULL
    AND driver_sequence IS NOT NULL
    AND delivery_slot_id IS NOT NULL;

-- Cas 2 : commande sans créneau
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_driver_seq_no_slot
  ON orders(delivery_date, driver_id, driver_sequence)
  WHERE driver_id IS NOT NULL
    AND driver_sequence IS NOT NULL
    AND delivery_slot_id IS NULL;
