-- Ajout colonne rappel sur les commandes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_days INTEGER;
