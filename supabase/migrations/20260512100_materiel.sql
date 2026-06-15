-- Table matériel de production
CREATE TABLE IF NOT EXISTS public.materiel (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL,
  capacite_kg numeric(10,2) NOT NULL,
  atelier     text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.materiel ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'materiel' AND policyname = 'Authenticated full access'
  ) THEN
    CREATE POLICY "Authenticated full access" ON public.materiel
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
