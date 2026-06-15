-- ─── Phase 1 : Référentiel de production ────────────────────────────────────

-- Postes de travail (pétrin, four, façonnage…)
CREATE TABLE IF NOT EXISTS public.postes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                  text NOT NULL,
  type                 text NOT NULL DEFAULT 'machine', -- 'machine' | 'humain'
  capacite_simultanee  int  NOT NULL DEFAULT 1,         -- nb de tâches en parallèle
  notes                text,
  created_at           timestamptz DEFAULT now()
);
ALTER TABLE public.postes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.postes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Disponibilités hebdomadaires — branché sur rh_employes (déjà existant)
-- jour_semaine : 0 = lundi … 6 = dimanche
CREATE TABLE IF NOT EXISTS public.disponibilites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id    uuid NOT NULL REFERENCES public.rh_employes(id) ON DELETE CASCADE,
  jour_semaine  int  NOT NULL,
  heure_debut   time NOT NULL,
  heure_fin     time NOT NULL,
  pause_min     int  NOT NULL DEFAULT 0
);
ALTER TABLE public.disponibilites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.disponibilites
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Étapes de recette
-- duree_fixe_min      : temps constant quelle que soit la quantité (pétrissage, cuisson)
-- duree_par_piece_sec : temps par pièce (façonnage : 3 sec/pain)
-- necessite_personnel : si vrai, le temps dépend du nb de personnes au poste
CREATE TABLE IF NOT EXISTS public.etapes_recette (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_sheet_id     uuid NOT NULL REFERENCES public.recipe_sheets(id) ON DELETE CASCADE,
  ordre               int  NOT NULL DEFAULT 0,
  nom                 text NOT NULL,
  poste_id            uuid REFERENCES public.postes(id) ON DELETE SET NULL,
  duree_fixe_min      numeric(8,2),   -- nullable
  duree_par_piece_sec numeric(8,2),   -- nullable
  necessite_personnel bool NOT NULL DEFAULT false,
  notes               text
);
ALTER TABLE public.etapes_recette ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.etapes_recette
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
