-- ============================================
-- BDK COMMANDES - SCHEMA SUPABASE
-- ============================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: categories
-- ============================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  ordre INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catégories par défaut
INSERT INTO categories (nom, ordre) VALUES
  ('Pâtisserie', 1),
  ('Boulangerie', 2),
  ('Viennoiserie', 3),
  ('Chocolaterie', 4),
  ('Snack', 5),
  ('Traiteur', 6);

-- ============================================
-- TABLE: products
-- ============================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference TEXT UNIQUE,
  nom TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  prix DECIMAL(10,2) DEFAULT 0,
  unite TEXT DEFAULT 'pièce',
  delai_preparation INT DEFAULT 0,
  note_production TEXT,
  is_frequent BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_nom ON products(nom);

-- ============================================
-- TABLE: clients
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  contact_nom TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  adresse_livraison TEXT,
  type_client TEXT DEFAULT 'autre',
  jours_livraison TEXT[] DEFAULT '{}',
  horaire_livraison TEXT,
  note_interne TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_clients_active ON clients(is_active);
CREATE INDEX idx_clients_nom ON clients(nom);
CREATE INDEX idx_clients_type ON clients(type_client);

-- ============================================
-- TABLE: orders
-- ============================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero TEXT UNIQUE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  date_livraison DATE NOT NULL,
  heure_livraison TIME,
  statut TEXT DEFAULT 'brouillon',
  note TEXT,
  total DECIMAL(10,2) DEFAULT 0,
  recurring_order_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_date ON orders(date_livraison);
CREATE INDEX idx_orders_statut ON orders(statut);
CREATE INDEX idx_orders_recurring ON orders(recurring_order_id);

-- Fonction pour générer numéro commande
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  next_num INT;
BEGIN
  year_prefix := TO_CHAR(NOW(), 'YY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM 3) AS INT)), 0) + 1
  INTO next_num
  FROM orders
  WHERE numero LIKE year_prefix || '%';

  NEW.numero := year_prefix || LPAD(next_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.numero IS NULL)
  EXECUTE FUNCTION generate_order_number();

-- ============================================
-- TABLE: order_items
-- ============================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_nom TEXT,
  quantite DECIMAL(10,2) NOT NULL DEFAULT 1,
  prix_unitaire DECIMAL(10,2) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ============================================
-- TABLE: recurring_orders
-- ============================================
CREATE TABLE recurring_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  nom TEXT,
  type_recurrence TEXT DEFAULT 'hebdo',
  jours_semaine TEXT[] DEFAULT '{}',
  heure_livraison TIME,
  date_debut DATE DEFAULT CURRENT_DATE,
  date_fin DATE,
  is_active BOOLEAN DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_recurring_client ON recurring_orders(client_id);
CREATE INDEX idx_recurring_active ON recurring_orders(is_active);

-- ============================================
-- TABLE: recurring_order_items
-- ============================================
CREATE TABLE recurring_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recurring_order_id UUID REFERENCES recurring_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_nom TEXT,
  quantite DECIMAL(10,2) NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_recurring_items_order ON recurring_order_items(recurring_order_id);

-- ============================================
-- FONCTION: Calculer total commande
-- ============================================
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET total = (
    SELECT COALESCE(SUM(quantite * prix_unitaire), 0)
    FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_total_on_item
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_order_total();

-- ============================================
-- FONCTION: Générer commandes depuis récurrences
-- ============================================
CREATE OR REPLACE FUNCTION generate_orders_from_recurring(target_date DATE)
RETURNS INT AS $$
DECLARE
  rec RECORD;
  item RECORD;
  new_order_id UUID;
  day_name TEXT;
  orders_created INT := 0;
BEGIN
  -- Nom du jour en français
  day_name := LOWER(TO_CHAR(target_date, 'TMDay'));

  -- Parcourir les récurrences actives
  FOR rec IN
    SELECT ro.*, c.nom as client_nom
    FROM recurring_orders ro
    JOIN clients c ON c.id = ro.client_id
    WHERE ro.is_active = TRUE
      AND ro.date_debut <= target_date
      AND (ro.date_fin IS NULL OR ro.date_fin >= target_date)
      AND (
        ro.type_recurrence = 'quotidien'
        OR (ro.type_recurrence = 'hebdo' AND day_name = ANY(ro.jours_semaine))
      )
      -- Vérifier qu'une commande n'existe pas déjà
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.recurring_order_id = ro.id
          AND o.date_livraison = target_date
      )
  LOOP
    -- Créer la commande
    INSERT INTO orders (client_id, date_livraison, heure_livraison, statut, recurring_order_id, note)
    VALUES (rec.client_id, target_date, rec.heure_livraison, 'confirmee', rec.id, rec.note)
    RETURNING id INTO new_order_id;

    -- Copier les lignes
    FOR item IN
      SELECT roi.*, p.prix, p.nom as product_name
      FROM recurring_order_items roi
      LEFT JOIN products p ON p.id = roi.product_id
      WHERE roi.recurring_order_id = rec.id
    LOOP
      INSERT INTO order_items (order_id, product_id, product_nom, quantite, prix_unitaire, note)
      VALUES (new_order_id, item.product_id, COALESCE(item.product_nom, item.product_name), item.quantite, COALESCE(item.prix, 0), item.note);
    END LOOP;

    orders_created := orders_created + 1;
  END LOOP;

  RETURN orders_created;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VUE: Production du jour
-- ============================================
CREATE OR REPLACE VIEW production_du_jour AS
SELECT
  p.id as product_id,
  p.nom as product_nom,
  p.reference,
  c.nom as categorie,
  c.ordre as categorie_ordre,
  SUM(oi.quantite) as quantite_totale,
  o.date_livraison
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN products p ON p.id = oi.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE o.statut IN ('confirmee', 'production')
GROUP BY p.id, p.nom, p.reference, c.nom, c.ordre, o.date_livraison
ORDER BY c.ordre, p.nom;

-- ============================================
-- RLS (Row Level Security) - Simple
-- ============================================
-- Pour l'instant, pas de RLS complexe
-- On peut l'ajouter plus tard si multi-utilisateurs

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_order_items ENABLE ROW LEVEL SECURITY;

-- Policies simples (accès total pour utilisateurs authentifiés)
CREATE POLICY "Accès total categories" ON categories FOR ALL USING (true);
CREATE POLICY "Accès total products" ON products FOR ALL USING (true);
CREATE POLICY "Accès total clients" ON clients FOR ALL USING (true);
CREATE POLICY "Accès total orders" ON orders FOR ALL USING (true);
CREATE POLICY "Accès total order_items" ON order_items FOR ALL USING (true);
CREATE POLICY "Accès total recurring_orders" ON recurring_orders FOR ALL USING (true);
CREATE POLICY "Accès total recurring_order_items" ON recurring_order_items FOR ALL USING (true);
