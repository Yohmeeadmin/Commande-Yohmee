-- Migration: poids unitaire en grammes pour conversion des unités "pièce"
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS poids_unitaire_g NUMERIC DEFAULT NULL;
