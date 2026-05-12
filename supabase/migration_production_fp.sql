-- Migration : Fiches de Production + Ordres de Fabrication

-- 1. Fiches de production (template : pâton → produit fini)
CREATE TABLE IF NOT EXISTS production_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sous_recette_id UUID REFERENCES recipe_sheets(id) ON DELETE SET NULL,
  recipe_sheet_id UUID REFERENCES recipe_sheets(id) ON DELETE SET NULL,
  rendement_theorique INTEGER NOT NULL DEFAULT 1,
  poids_piece_cible_g NUMERIC DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  company_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ordres de production (session de fabrication)
CREATE TABLE IF NOT EXISTS production_orders_fp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_production DATE NOT NULL DEFAULT CURRENT_DATE,
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('planifie','en_cours','termine')),
  notes TEXT DEFAULT NULL,
  company_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Lignes de production (1 ligne = 1 pâton → 1 produit)
CREATE TABLE IF NOT EXISTS production_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders_fp(id) ON DELETE CASCADE,
  production_sheet_id UUID REFERENCES production_sheets(id) ON DELETE SET NULL,
  numero_paton INTEGER NOT NULL DEFAULT 1,
  quantite_theorique INTEGER NOT NULL DEFAULT 1,
  quantite_reelle INTEGER DEFAULT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','termine')),
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_production_orders_fp_date ON production_orders_fp(date_production);
CREATE INDEX IF NOT EXISTS idx_production_order_lines_order ON production_order_lines(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_sheets_sr ON production_sheets(sous_recette_id);
