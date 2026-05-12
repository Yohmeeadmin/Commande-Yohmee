-- Migration v3: lier les recettes aux références produits (pas aux articles)

ALTER TABLE recipe_sheets
  ADD COLUMN IF NOT EXISTS product_reference_id UUID REFERENCES product_references(id) ON DELETE SET NULL;

-- Migrer les données existantes : résoudre la référence depuis l'article lié
UPDATE recipe_sheets rs
SET product_reference_id = pa.product_reference_id
FROM product_articles pa
WHERE rs.product_article_id = pa.id
  AND rs.product_reference_id IS NULL;

-- L'ancienne colonne product_article_id peut rester (compatibilité) mais n'est plus utilisée
