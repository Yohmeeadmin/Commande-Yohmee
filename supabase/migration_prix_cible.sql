-- Migration: prix_cible sur recipe_sheets
ALTER TABLE recipe_sheets ADD COLUMN IF NOT EXISTS prix_cible NUMERIC DEFAULT NULL;
