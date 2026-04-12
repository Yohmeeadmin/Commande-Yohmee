-- ============================================
-- TABLE: profiles (liée à auth.users)
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'autre',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  modules TEXT[] NOT NULL DEFAULT '{}',
  ateliers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Un utilisateur peut lire son propre profil
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Un admin peut lire tous les profils
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Un admin peut tout modifier
CREATE POLICY "profiles_all_admin" ON profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Trigger: updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CRÉER LE PREMIER ADMIN
-- Remplacez l'UUID par celui de votre utilisateur Supabase Auth
-- (Supabase > Authentication > Users > copiez l'UUID)
-- ============================================

-- INSERT INTO profiles (id, first_name, last_name, email, role, is_active, must_change_password, modules, ateliers)
-- VALUES (
--   'VOTRE-UUID-ICI',
--   'Prénom',
--   'Nom',
--   'email@exemple.com',
--   'admin',
--   TRUE,
--   FALSE,
--   ARRAY['dashboard','catalogue','clients','commandes','recurrences','planning','production','livraisons','rapports','parametres'],
--   ARRAY[]::TEXT[]
-- );
