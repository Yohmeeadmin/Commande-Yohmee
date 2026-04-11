-- Ajout du créneau de livraison sur les commandes récurrentes
ALTER TABLE recurring_orders
  ADD COLUMN IF NOT EXISTS delivery_slot_id UUID REFERENCES delivery_slots(id) ON DELETE SET NULL;
