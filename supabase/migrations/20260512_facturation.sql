-- ============================================================
-- MODULE FACTURATION — devis, factures, règlements, avoirs
-- ============================================================

-- ── Devis ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.devis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference      text NOT NULL UNIQUE,
  client_id      uuid REFERENCES public.clients(id),
  statut         text NOT NULL DEFAULT 'brouillon', -- brouillon | envoye | accepte | refuse | converti
  date_emission  date NOT NULL DEFAULT CURRENT_DATE,
  date_validite  date,
  notes          text,
  conditions     text,
  total_ht       numeric(12,2) DEFAULT 0,
  total_tva      numeric(12,2) DEFAULT 0,
  total_ttc      numeric(12,2) DEFAULT 0,
  order_id       uuid,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.devis_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id    uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  designation text NOT NULL,
  quantite    numeric(10,3) DEFAULT 1,
  prix_ht     numeric(12,2) DEFAULT 0,
  tva_pct     numeric(5,2)  DEFAULT 20,
  article_id  uuid,
  position    integer DEFAULT 0
);

-- ── Factures ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text NOT NULL UNIQUE,
  client_id        uuid REFERENCES public.clients(id),
  devis_id         uuid REFERENCES public.devis(id),
  statut           text NOT NULL DEFAULT 'brouillon', -- brouillon | emise | partiellement_reglee | soldee | annulee
  date_emission    date NOT NULL DEFAULT CURRENT_DATE,
  date_echeance    date,
  notes            text,
  total_ht         numeric(12,2) DEFAULT 0,
  total_tva        numeric(12,2) DEFAULT 0,
  total_ttc        numeric(12,2) DEFAULT 0,
  total_regle      numeric(12,2) DEFAULT 0,
  discount_percent numeric(5,2)  DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  designation text NOT NULL,
  quantite    numeric(10,3) DEFAULT 1,
  prix_ht     numeric(12,2) DEFAULT 0,
  tva_pct     numeric(5,2)  DEFAULT 20,
  position    integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.invoice_bons_livraison (
  invoice_id       uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  bon_livraison_id uuid REFERENCES public.bons_livraison(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, bon_livraison_id)
);

-- ── Règlements ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference  text NOT NULL UNIQUE,
  client_id  uuid REFERENCES public.clients(id),
  date       date NOT NULL DEFAULT CURRENT_DATE,
  montant    numeric(12,2) NOT NULL,
  mode       text NOT NULL DEFAULT 'virement', -- especes | virement | cheque | carte | avoir
  notes      text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_invoices (
  payment_id       uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id       uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  montant_applique numeric(12,2) NOT NULL,
  PRIMARY KEY (payment_id, invoice_id)
);

-- ── Avoirs ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference   text NOT NULL UNIQUE,
  invoice_id  uuid REFERENCES public.invoices(id),
  client_id   uuid REFERENCES public.clients(id),
  date        date NOT NULL DEFAULT CURRENT_DATE,
  montant     numeric(12,2) NOT NULL,
  motif       text,
  statut      text NOT NULL DEFAULT 'emis', -- emis | utilise
  created_at  timestamptz DEFAULT now()
);

-- ── RLS (permissif — à restreindre selon les besoins) ────────

ALTER TABLE public.devis               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_bons_livraison ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='devis' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.devis FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='devis_items' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.devis_items FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_items' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_bons_livraison' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.invoice_bons_livraison FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_invoices' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.payment_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='credit_notes' AND policyname='Authenticated full access') THEN
    CREATE POLICY "Authenticated full access" ON public.credit_notes FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;
