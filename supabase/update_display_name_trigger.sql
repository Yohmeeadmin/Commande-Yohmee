-- Mise à jour du trigger pour générer le display_name sans le code référence
-- Format: Nom produit - conditionnement quantité - état
-- Exemple: Petite tradition - lot 50 - pré-cuit

CREATE OR REPLACE FUNCTION generate_article_display_name()
RETURNS TRIGGER AS $$
DECLARE
  ref_name TEXT;
  pack_label TEXT;
  state_label TEXT;
BEGIN
  -- Récupérer le nom de la référence
  SELECT name INTO ref_name
  FROM product_references
  WHERE id = NEW.product_reference_id;

  -- Convertir pack_type en label
  pack_label := CASE NEW.pack_type
    WHEN 'unite' THEN 'unité'
    WHEN 'lot' THEN 'lot'
    WHEN 'carton' THEN 'carton'
    WHEN 'kg' THEN 'kg'
    WHEN 'portion' THEN 'portion'
    WHEN 'boite' THEN 'boîte'
    ELSE NEW.pack_type::TEXT
  END;

  -- Convertir product_state en label
  state_label := CASE NEW.product_state
    WHEN 'frais' THEN 'frais'
    WHEN 'pre_cuit' THEN 'pré-cuit'
    WHEN 'pre_pousse' THEN 'pré-poussé'
    WHEN 'congele' THEN 'congelé'
    ELSE NEW.product_state::TEXT
  END;

  -- Générer le display_name: Nom produit - conditionnement quantité - état
  NEW.display_name := ref_name || ' - ' || pack_label || ' ' || NEW.quantity || ' - ' || state_label;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Le trigger existe déjà, pas besoin de le recréer
-- Il utilisera automatiquement la nouvelle version de la fonction
