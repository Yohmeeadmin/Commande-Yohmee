-- Migration: fiches recettes

CREATE TABLE IF NOT EXISTS recipe_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  rendement NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  product_article_id UUID REFERENCES product_articles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_sheet_id UUID NOT NULL REFERENCES recipe_sheets(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  quantite NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE recipe_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on recipe_sheets" ON recipe_sheets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on recipe_ingredients" ON recipe_ingredients FOR ALL USING (true) WITH CHECK (true);
