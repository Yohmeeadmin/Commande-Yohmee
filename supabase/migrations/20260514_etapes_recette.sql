-- Migration: table etapes_recette + colonne etats_config

CREATE TABLE IF NOT EXISTS public.etapes_recette (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_sheet_id uuid NOT NULL REFERENCES public.recipe_sheets(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  nom text NOT NULL,
  poste_id uuid,
  materiel_id uuid REFERENCES public.materiel(id) ON DELETE SET NULL,
  duree_fixe_min numeric(8,2),
  duree_par_piece_sec numeric(8,2),
  necessite_personnel bool NOT NULL DEFAULT false,
  mode text CHECK (mode IN ('auto', 'manuel')),
  notes text
);

ALTER TABLE public.etapes_recette ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'etapes_recette'
      AND policyname = 'Authenticated full access'
  ) THEN
    CREATE POLICY "Authenticated full access" ON public.etapes_recette
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.recipe_sheets ADD COLUMN IF NOT EXISTS etats_config jsonb;
ALTER TABLE public.etapes_recette ADD COLUMN IF NOT EXISTS mode text CHECK (mode IN ('auto', 'manuel'));
