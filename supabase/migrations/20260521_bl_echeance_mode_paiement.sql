-- Add echeance, mode_paiement and statut columns to bons_livraison
ALTER TABLE public.bons_livraison
  ADD COLUMN IF NOT EXISTS echeance date,
  ADD COLUMN IF NOT EXISTS mode_paiement text,
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'brouillon';

-- Add mode_paiement to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS mode_paiement text;
