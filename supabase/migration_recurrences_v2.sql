-- ============================================
-- MIGRATION: recurring_order_items → V2
-- Ajoute product_article_id pour la V2 produits
-- ============================================

-- S'assurer que la table recurring_orders existe avec delivery_slot_id
CREATE TABLE IF NOT EXISTS recurring_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  nom TEXT,
  type_recurrence TEXT NOT NULL DEFAULT 'hebdo',
  jours_semaine TEXT[] DEFAULT '{}',
  date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_slot_id UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ajouter delivery_slot_id si manquant
ALTER TABLE recurring_orders
  ADD COLUMN IF NOT EXISTS delivery_slot_id UUID REFERENCES delivery_slots(id) ON DELETE SET NULL;

-- S'assurer que la table recurring_order_items existe
CREATE TABLE IF NOT EXISTS recurring_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_order_id UUID REFERENCES recurring_orders(id) ON DELETE CASCADE,
  product_article_id UUID REFERENCES product_articles(id) ON DELETE SET NULL,
  product_nom TEXT,
  quantite DECIMAL(10,2) NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ajouter product_article_id si la table existait déjà sans cette colonne
ALTER TABLE recurring_order_items
  ADD COLUMN IF NOT EXISTS product_article_id UUID REFERENCES product_articles(id) ON DELETE SET NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_recurring_client ON recurring_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_orders(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_items_order ON recurring_order_items(recurring_order_id);

-- RLS
ALTER TABLE recurring_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recurring_orders' AND policyname = 'Accès total recurring_orders') THEN
    CREATE POLICY "Accès total recurring_orders" ON recurring_orders FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recurring_order_items' AND policyname = 'Accès total recurring_order_items') THEN
    CREATE POLICY "Accès total recurring_order_items" ON recurring_order_items FOR ALL USING (true);
  END IF;
END $$;
