'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, X, Check, Loader2, Clock, Calendar, AlertCircle, Building2, Tag, Plus, Pencil, Trash2, Globe, Monitor } from 'lucide-react';
import { useAppSettings, ClientTypeDelivery, ClientTypeSettings } from '@/lib/useAppSettings';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES } from '@/types';
import Image from 'next/image';

interface Category {
  id: string;
  nom: string;
  ordre: number;
}

interface DeliverySlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

const DELIVERY_TYPES = CLIENT_TYPES.filter(t => t.value !== 'autre');

export default function ReglagesPage() {
  const { settings, loading, updateSettings, uploadLogo } = useAppSettings();
  const [uploading, setUploading] = useState(false);
  const [savingEntreprise, setSavingEntreprise] = useState(false);
  const [savedEntreprise, setSavedEntreprise] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savedDelivery, setSavedDelivery] = useState(false);
  const [savingLanding, setSavingLanding] = useState(false);
  const [savedLanding, setSavedLanding] = useState(false);
  const [landingTitle, setLandingTitle] = useState('');
  const [landingSubtitle, setLandingSubtitle] = useState('');
  const [errorEntreprise, setErrorEntreprise] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [typeSettings, setTypeSettings] = useState<ClientTypeSettings>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: string; nom: string } | null>(null);
  const [savingEditCategory, setSavingEditCategory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // Formulaire entreprise
  const [entreprise, setEntreprise] = useState({
    raison_sociale: '',
    company_tagline: '',
    rc: '',
    ice_societe: '',
    if_fiscal: '',
    cnss: '',
    tp: '',
    email_societe: '',
    telephone_societe: '',
    site_web: '',
    adresse_siege: '',
    code_postal: '',
    ville_siege: '',
    pays: 'Maroc',
  });

  useEffect(() => {
    supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }: { data: DeliverySlot[] | null }) => setSlots(data || []));
    supabase.from('categories').select('*').order('ordre')
      .then(({ data }: { data: Category[] | null }) => setCategories(data || []));
  }, []);

  if (!loading && !initialized.current) {
    initialized.current = true;
    setEntreprise({
      raison_sociale: settings.raison_sociale ?? settings.company_name ?? '',
      company_tagline: settings.company_tagline ?? '',
      rc: settings.rc ?? '',
      ice_societe: settings.ice_societe ?? '',
      if_fiscal: settings.if_fiscal ?? '',
      cnss: settings.cnss ?? '',
      tp: settings.tp ?? '',
      email_societe: settings.email_societe ?? '',
      telephone_societe: settings.telephone_societe ?? '',
      site_web: settings.site_web ?? '',
      adresse_siege: settings.adresse_siege ?? '',
      code_postal: settings.code_postal ?? '',
      ville_siege: settings.ville_siege ?? '',
      pays: settings.pays ?? 'Maroc',
    });
    setTypeSettings(settings.client_type_settings ?? {});
    setLandingTitle(settings.landing_title ?? settings.company_name ?? '');
    setLandingSubtitle(settings.landing_subtitle ?? settings.company_tagline ?? '');
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

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      const { data, error } = await supabase.from('categories').insert({
        nom: newCategoryName.trim(),
        ordre: categories.length + 1,
      }).select().single();
      if (error) { alert(`Erreur : ${error.message}`); return; }
      setCategories(prev => [...prev, data as Category]);
      setNewCategoryName('');
    } finally {
      setSavingCategory(false);
    }
  }

  async function saveEditCategory() {
    if (!editingCategory || !editingCategory.nom.trim()) return;
    setSavingEditCategory(true);
    try {
      const { error } = await supabase.from('categories')
        .update({ nom: editingCategory.nom.trim() })
        .eq('id', editingCategory.id);
      if (error) { alert(`Erreur : ${error.message}`); return; }
      setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...c, nom: editingCategory.nom.trim() } : c));
      setEditingCategory(null);
    } finally {
      setSavingEditCategory(false);
    }
  }

  async function deleteCategory(cat: Category) {
    const { count } = await supabase.from('product_references').select('*', { count: 'exact', head: true }).eq('category_id', cat.id);
    if (count && count > 0) {
      alert(`Impossible de supprimer "${cat.nom}" : ${count} référence${count > 1 ? 's' : ''} l'utilisent encore.`);
      return;
    }
    if (!confirm(`Supprimer la catégorie "${cat.nom}" ?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', cat.id);
    if (error) { alert(`Erreur : ${error.message}`); return; }
    setCategories(prev => prev.filter(c => c.id !== cat.id));
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
      setUploadError(uploadErr ?? "Erreur inconnue lors de l'upload.");
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

  async function handleSaveEntreprise() {
    setSavingEntreprise(true);
    setErrorEntreprise(null);
    const { error } = await updateSettings({
      raison_sociale: entreprise.raison_sociale || null,
      company_name: entreprise.raison_sociale || settings.company_name,
      company_tagline: entreprise.company_tagline || null,
      rc: entreprise.rc || null,
      ice_societe: entreprise.ice_societe || null,
      if_fiscal: entreprise.if_fiscal || null,
      cnss: entreprise.cnss || null,
      tp: entreprise.tp || null,
      email_societe: entreprise.email_societe || null,
      telephone_societe: entreprise.telephone_societe || null,
      site_web: entreprise.site_web || null,
      adresse_siege: entreprise.adresse_siege || null,
      code_postal: entreprise.code_postal || null,
      ville_siege: entreprise.ville_siege || null,
      pays: entreprise.pays || null,
    });
    setSavingEntreprise(false);
    if (error) {
      setErrorEntreprise((error as { message?: string }).message ?? 'Erreur lors de la sauvegarde');
    } else {
      setSavedEntreprise(true);
      setTimeout(() => setSavedEntreprise(false), 2000);
    }
  }

  async function handleSaveLanding() {
    setSavingLanding(true);
    await updateSettings({
      landing_title: landingTitle || null,
      landing_subtitle: landingSubtitle || null,
    } as any);
    setSavingLanding(false);
    setSavedLanding(true);
    setTimeout(() => setSavedLanding(false), 2000);
  }

  async function handleSaveDelivery() {
    setSavingDelivery(true);
    await updateSettings({ client_type_settings: typeSettings });
    setSavingDelivery(false);
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

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Réglages</h1>
        <p className="text-gray-500 mt-1">Personnalisation de l'application</p>
      </div>

      {/* ── Mon entreprise ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-blue-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Mon entreprise</h2>
              <p className="text-xs text-gray-400 mt-0.5">Ces informations apparaissent sur vos bons de livraison</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {errorEntreprise && (
              <span className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle size={13} /> {errorEntreprise}
              </span>
            )}
            <button
              onClick={handleSaveEntreprise}
              disabled={savingEntreprise}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {savingEntreprise ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : savedEntreprise ? <><Check size={14} /> Enregistré</> : 'Sauvegarder'}
            </button>
          </div>
        </div>

        {/* Logo */}
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            {currentLogo ? (
              <Image src={currentLogo} alt="Logo" width={80} height={80} className="w-full h-full object-contain" unoptimized />
            ) : (
              <span className="text-3xl font-bold text-blue-600">{(entreprise.raison_sociale || 'B').charAt(0)}</span>
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

        {/* Raison sociale + tagline */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Raison sociale</label>
            <input type="text" value={entreprise.raison_sociale} onChange={e => setEntreprise(f => ({ ...f, raison_sociale: e.target.value }))}
              placeholder="BDK FOOD SARL" className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Sous-titre</label>
            <input type="text" value={entreprise.company_tagline} onChange={e => setEntreprise(f => ({ ...f, company_tagline: e.target.value }))}
              placeholder="Boulangerie | Pâtisserie | Chocolat" className={inputClass} />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Identifiants légaux</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>R.C</label>
              <input type="text" value={entreprise.rc} onChange={e => setEntreprise(f => ({ ...f, rc: e.target.value }))}
                placeholder="151343" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>E-mail</label>
              <input type="email" value={entreprise.email_societe} onChange={e => setEntreprise(f => ({ ...f, email_societe: e.target.value }))}
                placeholder="Commercial@bdk-food.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>I.C.E</label>
              <input type="text" value={entreprise.ice_societe} onChange={e => setEntreprise(f => ({ ...f, ice_societe: e.target.value }))}
                placeholder="003524755000061" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Téléphone</label>
              <input type="tel" value={entreprise.telephone_societe} onChange={e => setEntreprise(f => ({ ...f, telephone_societe: e.target.value }))}
                placeholder="0600414890" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>I.F</label>
              <input type="text" value={entreprise.if_fiscal} onChange={e => setEntreprise(f => ({ ...f, if_fiscal: e.target.value }))}
                placeholder="660040481" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Site Web</label>
              <input type="text" value={entreprise.site_web} onChange={e => setEntreprise(f => ({ ...f, site_web: e.target.value }))}
                placeholder="WWW.bdk-food.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>C.N.S.S</label>
              <input type="text" value={entreprise.cnss} onChange={e => setEntreprise(f => ({ ...f, cnss: e.target.value }))}
                placeholder="" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>T.P</label>
              <input type="text" value={entreprise.tp} onChange={e => setEntreprise(f => ({ ...f, tp: e.target.value }))}
                placeholder="64006880" className={inputClass} />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Adresse du siège</p>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Adresse</label>
              <textarea value={entreprise.adresse_siege} onChange={e => setEntreprise(f => ({ ...f, adresse_siege: e.target.value }))}
                placeholder="Lot 911, Al Massar" rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Code postal</label>
                <input type="text" value={entreprise.code_postal} onChange={e => setEntreprise(f => ({ ...f, code_postal: e.target.value }))}
                  placeholder="40000" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Ville</label>
                <input type="text" value={entreprise.ville_siege} onChange={e => setEntreprise(f => ({ ...f, ville_siege: e.target.value }))}
                  placeholder="Marrakech" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Pays</label>
                <input type="text" value={entreprise.pays} onChange={e => setEntreprise(f => ({ ...f, pays: e.target.value }))}
                  placeholder="Maroc" className={inputClass} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Livraison par type de client ─────────────────────────────────────── */}
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
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{type.label}</span>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => updateTypeSetting(type.value, { mode: 'heure', creneau_id: null })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${cfg.mode === 'heure' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Clock size={13} /> Heure
                    </button>
                    <button
                      onClick={() => updateTypeSetting(type.value, { mode: 'creneau', heure: null })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${cfg.mode === 'creneau' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Calendar size={13} /> Créneau
                    </button>
                  </div>
                </div>
                {cfg.mode === 'heure' ? (
                  <input type="time" value={cfg.heure ?? ''} onChange={e => updateTypeSetting(type.value, { heure: e.target.value || null })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                ) : (
                  <select value={cfg.creneau_id ?? ''} onChange={e => updateTypeSetting(type.value, { creneau_id: e.target.value || null })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— Aucun créneau par défaut —</option>
                    {slots.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)})</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSaveDelivery}
          disabled={savingDelivery}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {savingDelivery ? <><Loader2 size={16} className="animate-spin" /> Enregistrement…</> : savedDelivery ? <><Check size={16} /> Enregistré</> : 'Enregistrer'}
        </button>
      </div>

      {/* ── Portail client ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-blue-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Portail client</h2>
            <p className="text-xs text-gray-400 mt-0.5">Paramètres de commande en ligne</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Heure limite de commande
          </label>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={(settings.portal_order_deadline as string | undefined)?.slice(0, 5) ?? '18:00'}
              onChange={async e => {
                await updateSettings({ portal_order_deadline: e.target.value + ':00' } as any);
              }}
              className="px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            />
            <p className="text-sm text-gray-500">Les commandes passées après cette heure seront mises en attente de validation.</p>
          </div>
        </div>
      </div>

      {/* ── Page d'accueil publique ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor size={18} className="text-blue-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Page d'accueil publique</h2>
              <p className="text-xs text-gray-400 mt-0.5">Textes affichés sur bdkfood.com</p>
            </div>
          </div>
          <button
            onClick={handleSaveLanding}
            disabled={savingLanding}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingLanding ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : savedLanding ? <><Check size={14} /> Enregistré</> : 'Sauvegarder'}
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Titre principal</label>
            <input type="text" value={landingTitle} onChange={e => setLandingTitle(e.target.value)}
              placeholder="BDK Food" className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">Affiché en grand dans le hero de la page</p>
          </div>
          <div>
            <label className={labelClass}>Sous-titre</label>
            <input type="text" value={landingSubtitle} onChange={e => setLandingSubtitle(e.target.value)}
              placeholder="Artisan boulanger · Pâtissier · Chocolatier" className={inputClass} />
          </div>
        </div>
      </div>

      {/* ── Catégories ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Tag size={18} className="text-blue-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Catégories produits</h2>
            <p className="text-xs text-gray-400 mt-0.5">Organiser les références du catalogue</p>
          </div>
        </div>

        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune catégorie</p>
          )}
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
              {editingCategory?.id === cat.id ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={editingCategory.nom}
                    onChange={e => setEditingCategory(prev => prev ? { ...prev, nom: e.target.value } : null)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEditCategory(); if (e.key === 'Escape') setEditingCategory(null); }}
                    className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={saveEditCategory}
                    disabled={savingEditCategory}
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {savingEditCategory ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button
                    onClick={() => setEditingCategory(null)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-gray-800">{cat.nom}</span>
                  <button
                    onClick={() => setEditingCategory({ id: cat.id, nom: cat.nom })}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteCategory(cat)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            placeholder="Nouvelle catégorie…"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addCategory}
            disabled={!newCategoryName.trim() || savingCategory}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingCategory ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
