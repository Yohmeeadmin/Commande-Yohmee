-- Zones de stock (emplacements physiques : réserve sèche, chambre froide, etc.)
CREATE TABLE IF NOT EXISTS stock_zones (
  id      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nom     text NOT NULL,
  couleur text NOT NULL DEFAULT '#6366f1',
  ordre   integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES stock_zones(id) ON DELETE SET NULL;
