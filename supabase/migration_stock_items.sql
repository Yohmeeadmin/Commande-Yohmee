-- Migration: ajout colonnes sur stock_items
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS categorie TEXT,
  ADD COLUMN IF NOT EXISTS conditionnement TEXT,
  ADD COLUMN IF NOT EXISTS poids_conditionnement NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prix_achat NUMERIC DEFAULT 0;

-- Table des catégories MP
CREATE TABLE IF NOT EXISTS stock_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  ordre INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all on stock_categories" ON stock_categories FOR ALL USING (true) WITH CHECK (true);
