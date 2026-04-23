'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface ClientTypeDelivery {
  mode: 'heure' | 'creneau';
  heure: string | null;
  creneau_id: string | null;
}

export type ClientTypeSettings = Partial<Record<string, ClientTypeDelivery>>;

export interface AppSettings {
  id: number;
  company_name: string;
  company_tagline: string | null;
  logo_url: string | null;
  primary_color: string;
  client_type_settings: ClientTypeSettings;
  // Mon entreprise
  raison_sociale: string | null;
  rc: string | null;
  ice_societe: string | null;
  if_fiscal: string | null;
  cnss: string | null;
  tp: string | null;
  email_societe: string | null;
  telephone_societe: string | null;
  site_web: string | null;
  adresse_siege: string | null;
  code_postal: string | null;
  ville_siege: string | null;
  pays: string | null;
  portal_order_deadline: string;
  // Vitrine publique
  landing_title: string | null;
  landing_subtitle: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  company_name: 'BDK Commandes',
  company_tagline: 'Boulangerie | Pâtisserie | Chocolat',
  logo_url: null,
  primary_color: '#2563eb',
  client_type_settings: {},
  raison_sociale: null,
  rc: null,
  ice_societe: null,
  if_fiscal: null,
  cnss: null,
  tp: null,
  email_societe: null,
  telephone_societe: null,
  site_web: null,
  adresse_siege: null,
  code_postal: null,
  ville_siege: null,
  pays: 'Maroc',
  portal_order_deadline: '18:00:00',
  landing_title: null,
  landing_subtitle: null,
};

// Cache module-level : évite les re-fetch sur chaque composant qui consomme le hook
let settingsCache: AppSettings | null = null;
const settingsListeners: Array<(s: AppSettings) => void> = [];

function notifySettingsListeners(s: AppSettings) {
  settingsCache = s;
  settingsListeners.forEach(fn => fn(s));
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(settingsCache ?? DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!settingsCache);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (data) {
      // Si logo_url est null en DB, on utilise le logo statique par défaut
      const merged = { ...data, logo_url: data.logo_url ?? '/logo.png' };
      notifySettingsListeners(merged as AppSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    settingsListeners.push(setSettings);
    if (!settingsCache) {
      load();
    } else {
      setSettings(settingsCache);
      setLoading(false);
    }
    return () => {
      const idx = settingsListeners.indexOf(setSettings);
      if (idx !== -1) settingsListeners.splice(idx, 1);
    };
  }, [load]);

  async function updateSettings(updates: Partial<Omit<AppSettings, 'id'>>) {
    const { data, error } = await supabase
      .from('app_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single();
    if (!error && data) notifySettingsListeners(data as AppSettings);
    return { error };
  }

  async function uploadLogo(file: File): Promise<{ url: string | null; error: string | null }> {
    const ext = file.name.split('.').pop();
    const path = `logo.${ext}`;
    const { error } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) return { url: null, error: error.message };
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
    return { url: `${publicUrl}?t=${Date.now()}`, error: null };
  }

  return { settings, loading, updateSettings, uploadLogo, reload: load };
}
