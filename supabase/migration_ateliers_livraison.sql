-- ============================================
-- MIGRATION: Ateliers + Livraison partielle
-- ============================================

-- 1. Ajouter le champ atelier sur products
ALTER TABLE products
ADD COLUMN IF NOT EXISTS atelier TEXT DEFAULT 'autre';

-- Créer un index pour filtrer par atelier
CREATE INDEX IF NOT EXISTS idx_products_atelier ON products(atelier);

-- 2. Modifier la table orders pour le workflow livraison
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_fully_delivered BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'normal';

-- Index pour les commandes reliquat
CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);

-- 3. Modifier order_items pour tracker les quantités livrées
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS quantite_livree DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS quantite_restante DECIMAL(10,2) GENERATED ALWAYS AS (quantite - COALESCE(quantite_livree, quantite)) STORED;

-- 4. Vue améliorée: Production par atelier
CREATE OR REPLACE VIEW production_par_atelier AS
SELECT
  p.atelier,
  p.id as product_id,
  p.nom as product_nom,
  p.reference,
  c.nom as categorie,
  SUM(oi.quantite) as quantite_totale,
  o.date_livraison
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN products p ON p.id = oi.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE o.statut IN ('confirmee', 'production')
GROUP BY p.atelier, p.id, p.nom, p.reference, c.nom, o.date_livraison
ORDER BY p.atelier, p.nom;

-- 5. Fonction pour créer une commande reliquat
CREATE OR REPLACE FUNCTION create_backorder(
  p_parent_order_id UUID,
  p_new_delivery_date DATE,
  p_items JSONB -- [{product_id, product_nom, quantite, prix_unitaire}]
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
    date_livraison,
    heure_livraison,
    statut,
    note,
    parent_order_id,
    order_type
  ) VALUES (
    v_parent_order.client_id,
    p_new_delivery_date,
    v_parent_order.heure_livraison,
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
      product_id,
      product_nom,
      quantite,
      prix_unitaire
    ) VALUES (
      v_new_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_nom',
      (v_item->>'quantite')::DECIMAL,
      (v_item->>'prix_unitaire')::DECIMAL
    );
  END LOOP;

  RETURN v_new_order_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Fonction pour marquer une commande comme livrée (complète ou partielle)
CREATE OR REPLACE FUNCTION mark_order_delivered(
  p_order_id UUID,
  p_is_fully_delivered BOOLEAN,
  p_delivered_items JSONB DEFAULT NULL -- [{order_item_id, quantite_livree}]
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
BEGIN
  -- Mettre à jour la commande
  UPDATE orders
  SET
    statut = 'livree',
    delivered_at = NOW(),
    is_fully_delivered = p_is_fully_delivered,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Si livraison partielle, mettre à jour les quantités livrées
  IF NOT p_is_fully_delivered AND p_delivered_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_delivered_items)
    LOOP
      UPDATE order_items
      SET quantite_livree = (v_item->>'quantite_livree')::DECIMAL
      WHERE id = (v_item->>'order_item_id')::UUID;
    END LOOP;
  ELSE
    -- Livraison complète: quantite_livree = quantite
    UPDATE order_items
    SET quantite_livree = quantite
    WHERE order_id = p_order_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
