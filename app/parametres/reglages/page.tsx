'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, X, Check, Loader2, Clock, Calendar, AlertCircle } from 'lucide-react';
import { useAppSettings, ClientTypeDelivery, ClientTypeSettings } from '@/lib/useAppSettings';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES } from '@/types';
import Image from 'next/image';

interface DeliverySlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

// Types concernés par la config livraison (pas "autre")
const DELIVERY_TYPES = CLIENT_TYPES.filter(t => t.value !== 'autre');

export default function ReglagesPage() {
  const { settings, loading, updateSettings, uploadLogo } = useAppSettings();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedDelivery, setSavedDelivery] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [typeSettings, setTypeSettings] = useState<ClientTypeSettings>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }: { data: DeliverySlot[] | null }) => setSlots(data || []));
  }, []);

  if (!loading && !initialized.current) {
    initialized.current = true;
    setCompanyName(settings.company_name);
    setTagline(settings.company_tagline ?? '');
    setTypeSettings(settings.client_type_settings ?? {});
  }

  function getTypeSetting(type: string): ClientTypeDelivery {
    return typeSettings[type] ?? { mode: 'creneau', heure: null, creneau_id: null };
  }

  function updateTypeSetting(type: string, updates: Partial<ClientTypeDelivery>) {
    setTypeSettings(prev => ({
      ...prev,
      [type]: { ...getTypeSetting(type), ...updates },
    }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    const { url, error: uploadErr } = await uploadLogo(file);
    setUploading(false);
    if (uploadErr || !url) {
      setPreview(null);
      setUploadError(uploadErr ?? 'Erreur inconnue lors de l\'upload.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    await updateSettings({ logo_url: url });
    setPreview(null);
  }

  async function handleRemoveLogo() {
    await updateSettings({ logo_url: null });
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSave() {
    setSaving(true);
    await updateSettings({ company_name: companyName, company_tagline: tagline || null });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSaveDelivery() {
    setSaving(true);
    await updateSettings({ client_type_settings: typeSettings });
    setSaving(false);
    setSavedDelivery(true);
    setTimeout(() => setSavedDelivery(false), 2000);
  }

  const currentLogo = preview ?? settings.logo_url;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Réglages</h1>
        <p className="text-gray-500 mt-1">Personnalisation de l'application</p>
      </div>

      {/* Logo */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Logo</h2>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            {currentLogo ? (
              <Image src={currentLogo} alt="Logo" width={80} height={80} className="w-full h-full object-contain" unoptimized />
            ) : (
              <span className="text-3xl font-bold text-blue-600">{companyName.charAt(0) || 'B'}</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? <><Loader2 size={16} className="animate-spin" /> Envoi…</> : <><Upload size={16} /> Choisir un fichier</>}
            </button>
            {currentLogo && (
              <button onClick={handleRemoveLogo} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
                <X size={16} /> Supprimer
              </button>
            )}
            <p className="text-xs text-gray-400">PNG, JPG, SVG · Max 2 Mo</p>
            {uploadError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 max-w-xs">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nom & tagline */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Informations</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sous-titre</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Boulangerie | Pâtisserie | Chocolat"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <><Loader2 size={16} className="animate-spin" /> Enregistrement…</> : saved ? <><Check size={16} /> Enregistré</> : 'Enregistrer'}
        </button>
      </div>

      {/* Livraison par type de client */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-900">Livraison par type de client</h2>
          <p className="text-sm text-gray-400 mt-0.5">Définissez si chaque type reçoit une heure précise ou un créneau</p>
        </div>

        <div className="space-y-4">
          {DELIVERY_TYPES.map(type => {
            const cfg = getTypeSetting(type.value);
            return (
              <div key={type.value} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                {/* En-tête type */}
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{type.label}</span>
                  {/* Toggle heure / créneau */}
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => updateTypeSetting(type.value, { mode: 'heure', creneau_id: null })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        cfg.mode === 'heure' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Clock size={13} />
                      Heure
                    </button>
                    <button
                      onClick={() => updateTypeSetting(type.value, { mode: 'creneau', heure: null })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        cfg.mode === 'creneau' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Calendar size={13} />
                      Créneau
                    </button>
                  </div>
                </div>

                {/* Sélecteur selon le mode */}
                {cfg.mode === 'heure' ? (
                  <input
                    type="time"
                    value={cfg.heure ?? ''}
                    onChange={e => updateTypeSetting(type.value, { heure: e.target.value || null })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <select
                    value={cfg.creneau_id ?? ''}
                    onChange={e => updateTypeSetting(type.value, { creneau_id: e.target.value || null })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— Aucun créneau par défaut —</option>
                    {slots.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSaveDelivery}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <><Loader2 size={16} className="animate-spin" /> Enregistrement…</> : savedDelivery ? <><Check size={16} /> Enregistré</> : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
