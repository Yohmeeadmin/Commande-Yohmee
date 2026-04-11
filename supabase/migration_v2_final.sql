-- ============================================
-- BDK COMMANDES - MIGRATION V2 FINALE
-- Base propre: suppression V1 + création V2
-- ============================================

-- ============================================
-- 0. NETTOYAGE V1 (SUPPRESSION ANCIENNES TABLES)
-- ============================================

-- Supprimer les anciennes tables dans l'ordre (dépendances)
DROP TABLE IF EXISTS recurring_order_items CASCADE;
DROP TABLE IF EXISTS recurring_orders CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- Supprimer les anciennes vues si elles existent
DROP VIEW IF EXISTS production_du_jour CASCADE;
DROP VIEW IF EXISTS production_par_atelier CASCADE;

-- Supprimer les anciennes fonctions si elles existent
DROP FUNCTION IF EXISTS create_backorder CASCADE;
DROP FUNCTION IF EXISTS mark_order_delivered CASCADE;
DROP FUNCTION IF EXISTS generate_order_number CASCADE;

-- ============================================
-- 1. ENUMS
-- ============================================

-- Type d'atelier
DO $$ BEGIN
  CREATE TYPE atelier_type AS ENUM ('boulangerie', 'patisserie', 'chocolaterie', 'traiteur', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Type de conditionnement
DO $$ BEGIN
  CREATE TYPE pack_type AS ENUM ('unite', 'lot', 'carton', 'kg', 'portion', 'boite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- État du produit
DO $$ BEGIN
  CREATE TYPE product_state_type AS ENUM ('frais', 'pre_cuit', 'pre_pousse', 'congele');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Statut commande
DO $$ BEGIN
  CREATE TYPE order_status_type AS ENUM ('brouillon', 'confirmee', 'production', 'livree', 'annulee');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. TABLE CATEGORIES
-- ============================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  ordre INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_ordre ON categories(ordre);

-- ============================================
-- 3. TABLE CLIENTS (avec colonnes V2)
-- ============================================

-- Supprimer et recréer pour avoir une structure propre
DROP TABLE IF EXISTS clients CASCADE;

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  contact_nom TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  adresse_livraison TEXT,
  type_client TEXT DEFAULT 'autre',
  jours_livraison TEXT[] DEFAULT '{}',
  horaire_livraison TIME,
  note_interne TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_active ON clients(is_active);
CREATE INDEX idx_clients_type ON clients(type_client);

-- ============================================
-- 4. TABLE PRODUCT_REFERENCES
-- Référence de base pour la production
-- ============================================

CREATE TABLE product_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  atelier atelier_type NOT NULL DEFAULT 'autre',
  base_unit TEXT NOT NULL DEFAULT 'piece',
  base_unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  description TEXT,
  note_production TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_references_atelier ON product_references(atelier);
CREATE INDEX idx_product_references_category ON product_references(category_id);
CREATE INDEX idx_product_references_active ON product_references(is_active);
CREATE INDEX idx_product_references_code ON product_references(code);

-- ============================================
-- 5. TABLE PRODUCT_ARTICLES
-- Formats commerciaux vendus aux clients
-- ============================================

CREATE TABLE product_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_reference_id UUID NOT NULL REFERENCES product_references(id) ON DELETE CASCADE,
  pack_type pack_type NOT NULL DEFAULT 'unite',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  product_state product_state_type NOT NULL DEFAULT 'frais',
  custom_price DECIMAL(10,2), -- NULL = utiliser prix auto (calculé côté app)
  display_name TEXT NOT NULL, -- Généré automatiquement par trigger
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Un seul article par combinaison référence/type/quantité/état
  UNIQUE(product_reference_id, pack_type, quantity, product_state)
);

CREATE INDEX idx_product_articles_reference ON product_articles(product_reference_id);
CREATE INDEX idx_product_articles_active ON product_articles(is_active);

-- ============================================
-- 6. TRIGGER: Génération automatique display_name
-- ============================================

CREATE OR REPLACE FUNCTION generate_article_display_name()
RETURNS TRIGGER AS $$
DECLARE
  v_ref RECORD;
  v_pack_label TEXT;
  v_state_label TEXT;
BEGIN
  -- Récupérer la référence produit
  SELECT code, name INTO v_ref
  FROM product_references
  WHERE id = NEW.product_reference_id;

  -- Labels français pour pack_type
  v_pack_label := CASE NEW.pack_type
    WHEN 'unite' THEN 'unité'
    WHEN 'lot' THEN 'lot'
    WHEN 'carton' THEN 'carton'
    WHEN 'kg' THEN 'kg'
    WHEN 'portion' THEN 'portion'
    WHEN 'boite' THEN 'boîte'
    ELSE NEW.pack_type::TEXT
  END;

  -- Labels français pour product_state
  v_state_label := CASE NEW.product_state
    WHEN 'frais' THEN 'frais'
    WHEN 'pre_cuit' THEN 'pré-cuit'
    WHEN 'pre_pousse' THEN 'pré-poussé'
    WHEN 'congele' THEN 'congelé'
    ELSE NEW.product_state::TEXT
  END;

  -- Générer le display_name
  NEW.display_name := v_ref.code || ' - ' || v_ref.name || ' - ' || v_pack_label || ' ' || NEW.quantity || ' - ' || v_state_label;

  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_article_display_name
  BEFORE INSERT OR UPDATE ON product_articles
  FOR EACH ROW
  EXECUTE FUNCTION generate_article_display_name();

-- ============================================
-- 7. TABLE DELIVERY_SLOTS
-- Créneaux de livraison
-- ============================================

CREATE TABLE delivery_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_slots_active ON delivery_slots(is_active);
CREATE INDEX idx_delivery_slots_order ON delivery_slots(sort_order);

-- Créneaux par défaut
INSERT INTO delivery_slots (name, start_time, end_time, sort_order) VALUES
  ('Matin tôt', '05:00', '07:00', 1),
  ('Matin', '07:00', '09:00', 2),
  ('Mi-journée', '09:00', '12:00', 3),
  ('Après-midi', '14:00', '17:00', 4);

-- ============================================
-- 8. TABLE ORDERS
-- ============================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  delivery_date DATE NOT NULL,
  delivery_slot_id UUID REFERENCES delivery_slots(id) ON DELETE SET NULL,
  delivery_sequence INTEGER CHECK (delivery_sequence IS NULL OR delivery_sequence > 0),
  status order_status_type NOT NULL DEFAULT 'brouillon',
  note TEXT,
  total DECIMAL(10,2) DEFAULT 0,

  -- Livraison
  delivered_at TIMESTAMPTZ,
  is_fully_delivered BOOLEAN DEFAULT TRUE,

  -- Reliquat
  parent_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_type TEXT DEFAULT 'normal' CHECK (order_type IN ('normal', 'recurring', 'reliquat')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_date ON orders(delivery_date);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_slot ON orders(delivery_slot_id);
CREATE INDEX idx_orders_parent ON orders(parent_order_id);
CREATE INDEX idx_orders_type ON orders(order_type);

-- INDEX PARTIEL UNIQUE: un seul ordre par date/créneau/séquence (quand renseignés)
CREATE UNIQUE INDEX idx_orders_delivery_unique
ON orders(delivery_date, delivery_slot_id, delivery_sequence)
WHERE delivery_slot_id IS NOT NULL AND delivery_sequence IS NOT NULL;

-- ============================================
-- 9. TRIGGER: Génération numéro commande
-- ============================================

CREATE OR REPLACE FUNCTION generate_order_numero()
RETURNS TRIGGER AS $$
DECLARE
  v_date TEXT;
  v_count INTEGER;
BEGIN
  IF NEW.numero IS NULL THEN
    v_date := TO_CHAR(NEW.delivery_date, 'YYYYMMDD');

    SELECT COUNT(*) + 1 INTO v_count
    FROM orders
    WHERE delivery_date = NEW.delivery_date;

    NEW.numero := 'CMD-' || v_date || '-' || LPAD(v_count::TEXT, 3, '0');
  END IF;

  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_order_numero
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_numero();

-- ============================================
-- 10. TABLE ORDER_ITEMS
-- ============================================

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_article_id UUID NOT NULL REFERENCES product_articles(id) ON DELETE RESTRICT,

  -- Quantités
  quantity_ordered INTEGER NOT NULL DEFAULT 1 CHECK (quantity_ordered > 0),
  quantity_delivered INTEGER CHECK (quantity_delivered IS NULL OR quantity_delivered >= 0),

  -- Prix snapshot au moment de la commande
  unit_price DECIMAL(10,2) NOT NULL,

  -- Snapshot de la quantité unitaire de l'article (pour calcul production)
  article_unit_quantity INTEGER NOT NULL DEFAULT 1 CHECK (article_unit_quantity > 0),

  -- Total unités de production (calculé automatiquement)
  units_total INTEGER GENERATED ALWAYS AS (quantity_ordered * article_unit_quantity) STORED,

  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Pas de doublon article dans une même commande
  UNIQUE(order_id, product_article_id)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_article ON order_items(product_article_id);

-- ============================================
-- 11. TRIGGER: Calcul total commande
-- ============================================

CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET total = (
    SELECT COALESCE(SUM(quantity_ordered * unit_price), 0)
    FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_order_total
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_order_total();

-- ============================================
-- 12. VUES REPORTING
-- ============================================

-- Vue: Production par référence (unités totales)
CREATE OR REPLACE VIEW v_production_by_reference AS
SELECT
  pr.id AS reference_id,
  pr.code,
  pr.name,
  pr.atelier,
  o.delivery_date,
  SUM(oi.units_total) AS total_units_ordered,
  SUM(COALESCE(oi.quantity_delivered, 0) * oi.article_unit_quantity) AS total_units_delivered
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN product_articles pa ON pa.id = oi.product_article_id
JOIN product_references pr ON pr.id = pa.product_reference_id
WHERE o.status IN ('confirmee', 'production', 'livree')
GROUP BY pr.id, pr.code, pr.name, pr.atelier, o.delivery_date;

-- Vue: Ventes par article
CREATE OR REPLACE VIEW v_sales_by_article AS
SELECT
  pa.id AS article_id,
  pa.display_name,
  pr.code AS reference_code,
  pr.name AS reference_name,
  pr.atelier,
  pa.pack_type,
  pa.quantity AS unit_quantity,
  pa.product_state,
  o.delivery_date,
  SUM(oi.quantity_ordered) AS total_ordered,
  SUM(COALESCE(oi.quantity_delivered, 0)) AS total_delivered,
  SUM(oi.quantity_ordered * oi.unit_price) AS total_revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN product_articles pa ON pa.id = oi.product_article_id
JOIN product_references pr ON pr.id = pa.product_reference_id
WHERE o.status IN ('confirmee', 'production', 'livree')
GROUP BY pa.id, pa.display_name, pr.code, pr.name, pr.atelier,
         pa.pack_type, pa.quantity, pa.product_state, o.delivery_date;

-- Vue: Production par atelier
CREATE OR REPLACE VIEW v_production_by_atelier AS
SELECT
  pr.atelier,
  o.delivery_date,
  COUNT(DISTINCT pr.id) AS total_references,
  SUM(oi.units_total) AS total_units_ordered,
  SUM(COALESCE(oi.quantity_delivered, 0) * oi.article_unit_quantity) AS total_units_delivered
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN product_articles pa ON pa.id = oi.product_article_id
JOIN product_references pr ON pr.id = pa.product_reference_id
WHERE o.status IN ('confirmee', 'production', 'livree')
GROUP BY pr.atelier, o.delivery_date;

-- Vue: Livraisons du jour avec ordre
CREATE OR REPLACE VIEW v_deliveries AS
SELECT
  o.id AS order_id,
  o.numero,
  o.delivery_date,
  ds.id AS slot_id,
  ds.name AS slot_name,
  ds.start_time,
  ds.end_time,
  o.delivery_sequence,
  c.id AS client_id,
  c.nom AS client_nom,
  c.telephone AS client_telephone,
  c.adresse_livraison,
  o.status,
  o.total,
  o.delivered_at,
  o.is_fully_delivered
FROM orders o
JOIN clients c ON c.id = o.client_id
LEFT JOIN delivery_slots ds ON ds.id = o.delivery_slot_id
ORDER BY o.delivery_date, ds.sort_order NULLS LAST, o.delivery_sequence NULLS LAST;

-- ============================================
-- 13. FONCTIONS UTILITAIRES
-- ============================================

-- Fonction: Obtenir le prochain numéro de séquence pour un créneau
CREATE OR REPLACE FUNCTION get_next_delivery_sequence(
  p_date DATE,
  p_slot_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(delivery_sequence), 0) + 1 INTO v_max
  FROM orders
  WHERE delivery_date = p_date
    AND delivery_slot_id = p_slot_id;

  RETURN v_max;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Marquer une commande comme livrée
CREATE OR REPLACE FUNCTION mark_order_delivered(
  p_order_id UUID,
  p_is_fully_delivered BOOLEAN,
  p_delivered_items JSONB DEFAULT NULL -- [{order_item_id, quantity_delivered}]
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
BEGIN
  -- Mettre à jour la commande
  UPDATE orders
  SET
    status = 'livree',
    delivered_at = NOW(),
    is_fully_delivered = p_is_fully_delivered,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Si livraison partielle, mettre à jour les quantités livrées
  IF NOT p_is_fully_delivered AND p_delivered_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_delivered_items)
    LOOP
      UPDATE order_items
      SET quantity_delivered = (v_item->>'quantity_delivered')::INTEGER
      WHERE id = (v_item->>'order_item_id')::UUID;
    END LOOP;
  ELSE
    -- Livraison complète: quantity_delivered = quantity_ordered
    UPDATE order_items
    SET quantity_delivered = quantity_ordered
    WHERE order_id = p_order_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Créer une commande reliquat
CREATE OR REPLACE FUNCTION create_backorder(
  p_parent_order_id UUID,
  p_new_delivery_date DATE,
  p_items JSONB -- [{product_article_id, quantity, unit_price, article_unit_quantity}]
) RETURNS UUID AS $$
DECLARE
  v_parent_order RECORD;
  v_new_order_id UUID;
  v_item JSONB;
BEGIN
  -- Récupérer la commande parente
  SELECT * INTO v_parent_order FROM orders WHERE id = p_parent_order_id;

  IF v_parent_order IS NULL THEN
    RAISE EXCEPTION 'Commande parente non trouvée';
  END IF;

  -- Créer la nouvelle commande reliquat
  INSERT INTO orders (
    client_id,
    delivery_date,
    delivery_slot_id,
    status,
    note,
    parent_order_id,
    order_type
  ) VALUES (
    v_parent_order.client_id,
    p_new_delivery_date,
    v_parent_order.delivery_slot_id,
    'confirmee',
    'Reliquat de la commande ' || v_parent_order.numero,
    p_parent_order_id,
    'reliquat'
  ) RETURNING id INTO v_new_order_id;

  -- Ajouter les lignes de reliquat
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id,
      product_article_id,
      quantity_ordered,
      unit_price,
      article_unit_quantity
    ) VALUES (
      v_new_order_id,
      (v_item->>'product_article_id')::UUID,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'article_unit_quantity')::INTEGER
    );
  END LOOP;

  RETURN v_new_order_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Reporting ventes par période
CREATE OR REPLACE FUNCTION get_sales_report(
  p_start_date DATE,
  p_end_date DATE,
  p_atelier atelier_type DEFAULT NULL
) RETURNS TABLE (
  reference_code TEXT,
  reference_name TEXT,
  atelier atelier_type,
  article_display_name TEXT,
  pack_type pack_type,
  unit_quantity INTEGER,
  product_state product_state_type,
  total_ordered BIGINT,
  total_delivered BIGINT,
  total_units BIGINT,
  total_revenue DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.code,
    pr.name,
    pr.atelier,
    pa.display_name,
    pa.pack_type,
    pa.quantity,
    pa.product_state,
    SUM(oi.quantity_ordered)::BIGINT,
    SUM(COALESCE(oi.quantity_delivered, 0))::BIGINT,
    SUM(oi.units_total)::BIGINT,
    SUM(oi.quantity_ordered * oi.unit_price)
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN product_articles pa ON pa.id = oi.product_article_id
  JOIN product_references pr ON pr.id = pa.product_reference_id
  WHERE o.delivery_date BETWEEN p_start_date AND p_end_date
    AND o.status IN ('confirmee', 'production', 'livree')
    AND (p_atelier IS NULL OR pr.atelier = p_atelier)
  GROUP BY pr.code, pr.name, pr.atelier, pa.display_name,
           pa.pack_type, pa.quantity, pa.product_state
  ORDER BY pr.atelier, pr.name, pa.pack_type, pa.quantity;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Reporting production par référence
CREATE OR REPLACE FUNCTION get_production_report(
  p_start_date DATE,
  p_end_date DATE,
  p_atelier atelier_type DEFAULT NULL
) RETURNS TABLE (
  reference_code TEXT,
  reference_name TEXT,
  atelier atelier_type,
  total_units_ordered BIGINT,
  total_units_delivered BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.code,
    pr.name,
    pr.atelier,
    SUM(oi.units_total)::BIGINT,
    SUM(COALESCE(oi.quantity_delivered, 0) * oi.article_unit_quantity)::BIGINT
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN product_articles pa ON pa.id = oi.product_article_id
  JOIN product_references pr ON pr.id = pa.product_reference_id
  WHERE o.delivery_date BETWEEN p_start_date AND p_end_date
    AND o.status IN ('confirmee', 'production', 'livree')
    AND (p_atelier IS NULL OR pr.atelier = p_atelier)
  GROUP BY pr.code, pr.name, pr.atelier
  ORDER BY pr.atelier, pr.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 14. ROW LEVEL SECURITY
-- ============================================

-- Activer RLS sur les tables principales
ALTER TABLE product_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Policies permissives pour V1 (accès complet)
CREATE POLICY "Allow all on product_references" ON product_references FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on product_articles" ON product_articles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on clients" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on delivery_slots" ON delivery_slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on categories" ON categories FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 15. DONNÉES DE TEST (OPTIONNEL)
-- ============================================

-- Catégories de base
INSERT INTO categories (nom, ordre) VALUES
  ('Pains', 1),
  ('Viennoiseries', 2),
  ('Pâtisseries', 3),
  ('Chocolats', 4),
  ('Traiteur', 5)
ON CONFLICT DO NOTHING;

-- ============================================
-- FIN MIGRATION V2 FINALE
-- ============================================
