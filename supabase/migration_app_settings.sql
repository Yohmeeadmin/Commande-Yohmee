-- Table de réglages de l'application (une seule ligne)
CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  company_name text NOT NULL DEFAULT 'BDK Commandes',
  company_tagline text DEFAULT 'Boulangerie | Pâtisserie | Chocolat',
  logo_url text,
  primary_color text DEFAULT '#2563eb',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insérer la ligne par défaut si elle n'existe pas
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecture_authentifiee" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ecriture_admin" ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policy storage bucket logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "lecture_publique_logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "upload_admin_logos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'logos' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "delete_admin_logos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'logos' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
