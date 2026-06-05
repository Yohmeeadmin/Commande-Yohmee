-- Ajout du champ utilisateur sur les mouvements de stock
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS utilisateur text;
