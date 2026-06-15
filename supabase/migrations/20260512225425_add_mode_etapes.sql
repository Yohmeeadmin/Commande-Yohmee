ALTER TABLE public.etapes_recette ADD COLUMN IF NOT EXISTS mode text CHECK (mode IN ('auto', 'manuel'));
