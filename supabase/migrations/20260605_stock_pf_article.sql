-- Lien entre un stock_item PF et un product_article spécifique
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS product_article_id uuid REFERENCES product_articles(id) ON DELETE SET NULL;
