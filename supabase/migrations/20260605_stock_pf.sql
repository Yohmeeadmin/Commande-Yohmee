-- Stock produits finis — extension de stock_items
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'mp' CHECK (item_type IN ('mp', 'pf'));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS product_reference_id uuid REFERENCES product_references(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS atelier text;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS quantite_reservee numeric DEFAULT 0;
