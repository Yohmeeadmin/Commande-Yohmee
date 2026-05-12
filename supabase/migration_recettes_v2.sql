-- Migration v2: enrichissement fiches recettes

ALTER TABLE recipe_sheets
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'recette',
  ADD COLUMN IF NOT EXISTS perte_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS procede TEXT,
  ADD COLUMN IF NOT EXISTS atelier TEXT,
  ADD COLUMN IF NOT EXISTS categorie TEXT,
  ADD COLUMN IF NOT EXISTS allergenes TEXT[],
  ADD COLUMN IF NOT EXISTS poids_portion_g NUMERIC;

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS sous_recipe_id UUID REFERENCES recipe_sheets(id) ON DELETE SET NULL;

-- Rendre stock_item_id nullable (pour les lignes référençant une sous-recette)
ALTER TABLE recipe_ingredients ALTER COLUMN stock_item_id DROP NOT NULL;
