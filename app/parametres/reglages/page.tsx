'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Check, Loader2, Clock, Calendar, AlertCircle, Building2, Globe, Monitor, Link2, ShieldCheck, ShieldX, RefreshCw, Package, Users } from 'lucide-react';
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

interface Company {
  id: string;
  name: string;
  slug: string;
  woocommerce_url: string | null;
  woocommerce_key: string | null;
  woocommerce_secret: string | null;
}

interface CompanySettings {
  id?: number;
  company_id: string;
  company_name: string;
  company_tagline: string | null;
  logo_url: string | null;
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
}

const EMPTY_COMPANY_SETTINGS = (company_id: string): CompanySettings => ({
  company_id,
  company_name: '',
  company_tagline: null,
  logo_url: null,
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
});

const DELIVERY_TYPES = CLIENT_TYPES.filter(t => t.value !== 'autre');

export default function ReglagesPage() {
  const { settings, updateSettings } = useAppSettings();

  // ── Entreprises ────────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [savingEntreprise, setSavingEntreprise] = useState(false);
  const [savedEntreprise, setSavedEntreprise] = useState(false);
  const [errorEntreprise, setErrorEntreprise] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── WooCommerce ────────────────────────────────────────────────────────────
  const [woo, setWoo] = useState({ url: '', key: '', secret: '' });
  const [savingWoo, setSavingWoo] = useState(false);
  const [savedWoo, setSavedWoo] = useState(false);
  const [testingWoo, setTestingWoo] = useState(false);
  const [wooTestResult, setWooTestResult] = useState<'ok' | 'error' | null>(null);
  const [wooTestMsg, setWooTestMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ categories: number; products: number; articles: number; customers: number; errors: string[] } | null>(null);

  // ── Livraison ──────────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [typeSettings, setTypeSettings] = useState<ClientTypeSettings>({});
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savedDelivery, setSavedDelivery] = useState(false);

  // ── Landing ────────────────────────────────────────────────────────────────
  const [landingTitle, setLandingTitle] = useState('');
  const [landingSubtitle, setLandingSubtitle] = useState('');
  const [savingLanding, setSavingLanding] = useState(false);
  const [savedLanding, setSavedLanding] = useState(false);
  const initialized = useRef(false);

  // Charger les entreprises au montage
  useEffect(() => {
    supabase.from('companies').select('id, name, slug, woocommerce_url, woocommerce_key, woocommerce_secret').order('created_at').then(({ data }) => {
      const list = data || [];
      setCompanies(list);
      if (list.length > 0) setSelectedCompanyId(list[0].id);
    });
    supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => setSlots(data || []));
  }, []);

  // Sync settings globaux vers état local (livraison + landing)
  if (!initialized.current && settings.company_name) {
    initialized.current = true;
    setTypeSettings(settings.client_type_settings ?? {});
    setLandingTitle(settings.landing_title ?? settings.company_name ?? '');
    setLandingSubtitle(settings.landing_subtitle ?? settings.company_tagline ?? '');
  }

  // Sync champs WooCommerce quand on change d'entreprise
  useEffect(() => {
    const company = companies.find(c => c.id === selectedCompanyId);
    if (company) {
      setWoo({
        url: company.woocommerce_url ?? '',
        key: company.woocommerce_key ?? '',
        secret: company.woocommerce_secret ?? '',
      });
      setWooTestResult(null);
      setWooTestMsg('');
    }
  }, [selectedCompanyId, companies]);

  // Charger les réglages de l'entreprise sélectionnée
  const loadCompanySettings = useCallback(async (companyId: string) => {
    setLoadingCompany(true);
    setPreview(null);
    setUploadError(null);
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    setCompanySettings(data ? (data as CompanySettings) : EMPTY_COMPANY_SETTINGS(companyId));
    setLoadingCompany(false);
  }, []);

  useEffect(() => {
    if (selectedCompanyId) loadCompanySettings(selectedCompanyId);
  }, [selectedCompanyId, loadCompanySettings]);

  function updateField(field: keyof CompanySettings, value: string | null) {
    setCompanySettings(prev => prev ? { ...prev, [field]: value } : null);
  }

  // ── Sauvegarde entreprise ──────────────────────────────────────────────────
  async function handleSaveEntreprise() {
    if (!companySettings) return;
    setSavingEntreprise(true);
    setErrorEntreprise(null);
    const payload = {
      company_id: companySettings.company_id,
      company_name: companySettings.raison_sociale || companySettings.company_name || '',
      company_tagline: companySettings.company_tagline,
      logo_url: companySettings.logo_url,
      raison_sociale: companySettings.raison_sociale,
      rc: companySettings.rc,
      ice_societe: companySettings.ice_societe,
      if_fiscal: companySettings.if_fiscal,
      cnss: companySettings.cnss,
      tp: companySettings.tp,
      email_societe: companySettings.email_societe,
      telephone_societe: companySettings.telephone_societe,
      site_web: companySettings.site_web,
      adresse_siege: companySettings.adresse_siege,
      code_postal: companySettings.code_postal,
      ville_siege: companySettings.ville_siege,
      pays: companySettings.pays,
    };

    let error;
    if (companySettings.id) {
      ({ error } = await supabase.from('app_settings').update(payload).eq('id', companySettings.id));
    } else {
      const { data, error: insertError } = await supabase.from('app_settings').insert(payload).select().single();
      error = insertError;
      if (data) setCompanySettings(prev => prev ? { ...prev, id: (data as any).id } : null);
    }

    setSavingEntreprise(false);
    if (error) {
      setErrorEntreprise((error as { message?: string }).message ?? 'Erreur');
    } else {
      setSavedEntreprise(true);
      setTimeout(() => setSavedEntreprise(false), 2000);
    }
  }

  // ── Upload logo ────────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companySettings) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);

    const company = companies.find(c => c.id === selectedCompanyId);
    const slug = company?.slug ?? 'company';
    const ext = file.name.split('.').pop();
    const path = `${slug}.${ext}`;

    // Signed upload URL
    const signRes = await fetch('/api/upload-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, bucket: 'logos' }),
    });
    const signData = await signRes.json();
    if (!signRes.ok) { setUploadError(signData.error); setUploading(false); return; }

    const { error: upError } = await supabase.storage
      .from('logos')
      .uploadToSignedUrl(path, signData.token, file, { contentType: file.type });
    setUploading(false);
    if (upError) { setUploadError(upError.message); setPreview(null); return; }

    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    setCompanySettings(prev => prev ? { ...prev, logo_url: url } : null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── WooCommerce save + test ────────────────────────────────────────────────
  async function handleSaveWoo() {
    setSavingWoo(true);
    const { error } = await supabase.from('companies').update({
      woocommerce_url: woo.url || null,
      woocommerce_key: woo.key || null,
      woocommerce_secret: woo.secret || null,
    }).eq('id', selectedCompanyId);
    setSavingWoo(false);
    if (error) { alert(`Erreur : ${error.message}`); return; }
    setCompanies(prev => prev.map(c => c.id === selectedCompanyId
      ? { ...c, woocommerce_url: woo.url || null, woocommerce_key: woo.key || null, woocommerce_secret: woo.secret || null }
      : c
    ));
    setSavedWoo(true);
    setTimeout(() => setSavedWoo(false), 2000);
  }

  async function handleTestWoo() {
    if (!woo.url || !woo.key || !woo.secret) return;
    setTestingWoo(true);
    setWooTestResult(null);
    try {
      const base = woo.url.replace(/\/$/, '');
      const credentials = btoa(`${woo.key}:${woo.secret}`);
      const res = await fetch(`${base}/wp-json/wc/v3/system_status`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      if (res.ok) {
        const data = await res.json();
        const version = data?.environment?.version ?? '';
        setWooTestResult('ok');
        setWooTestMsg(`Connexion réussie${version ? ` · WooCommerce ${version}` : ''}`);
      } else {
        setWooTestResult('error');
        setWooTestMsg(`Erreur ${res.status} — vérifiez l'URL et les clés API`);
      }
    } catch {
      setWooTestResult('error');
      setWooTestMsg('Impossible de joindre le site. Vérifiez l\'URL et les CORS.');
    }
    setTestingWoo(false);
  }

  async function handleSync(sync_type: 'all' | 'products' | 'customers') {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/woocommerce/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: selectedCompanyId,
          sync_type,
          woocommerce_url: woo.url || company?.woocommerce_url,
          woocommerce_key: woo.key || company?.woocommerce_key,
          woocommerce_secret: woo.secret || company?.woocommerce_secret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur sync');
      setSyncResult(data);
    } catch (e: any) {
      setSyncResult({ categories: 0, products: 0, articles: 0, customers: 0, errors: [e.message] });
    }
    setSyncing(false);
  }

  // ── Livraison & Landing ────────────────────────────────────────────────────
  function getTypeSetting(type: string): ClientTypeDelivery {
    return typeSettings[type] ?? { mode: 'creneau', heure: null, creneau_id: null };
  }
  function updateTypeSetting(type: string, updates: Partial<ClientTypeDelivery>) {
    setTypeSettings(prev => ({ ...prev, [type]: { ...getTypeSetting(type), ...updates } }));
  }
  async function handleSaveDelivery() {
    setSavingDelivery(true);
    await updateSettings({ client_type_settings: typeSettings });
    setSavingDelivery(false);
    setSavedDelivery(true);
    setTimeout(() => setSavedDelivery(false), 2000);
  }
  async function handleSaveLanding() {
    setSavingLanding(true);
    await updateSettings({ landing_title: landingTitle || null, landing_subtitle: landingSubtitle || null } as any);
    setSavingLanding(false);
    setSavedLanding(true);
    setTimeout(() => setSavedLanding(false), 2000);
  }

  // La première entreprise créée est la principale (BDK) → elle seule a les sections globales
  const isMainCompany = companies.length > 0 && selectedCompanyId === companies[0]?.id;
  const company = companies.find(c => c.id === selectedCompanyId);

  const currentLogo = preview ?? companySettings?.logo_url;
  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Réglages</h1>
        <p className="text-gray-500 mt-1">Personnalisation de l'application</p>
      </div>

      {/* ── Mon entreprise ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

        {/* Onglets entreprises */}
        {companies.length > 0 && (
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {companies.map(company => (
              <button
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={`shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                  selectedCompanyId === company.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Building2 size={15} />
                {company.name}
              </button>
            ))}
          </div>
        )}

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Mon entreprise</h2>
              <p className="text-xs text-gray-400 mt-0.5">Ces informations apparaissent sur vos bons de livraison</p>
            </div>
            <div className="flex items-center gap-3">
              {errorEntreprise && (
                <span className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle size={13} /> {errorEntreprise}
                </span>
              )}
              <button
                onClick={handleSaveEntreprise}
                disabled={savingEntreprise || loadingCompany}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingEntreprise
                  ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
                  : savedEntreprise
                  ? <><Check size={14} /> Enregistré</>
                  : 'Sauvegarder'}
              </button>
            </div>
          </div>

          {loadingCompany ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-gray-300" />
            </div>
          ) : companySettings ? (
            <>
              {/* Logo */}
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {currentLogo ? (
                    <Image src={currentLogo} alt="Logo" width={80} height={80} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-3xl font-bold text-blue-600">
                      {(companySettings.raison_sociale || companies.find(c => c.id === selectedCompanyId)?.name || 'B').charAt(0)}
                    </span>
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
                    <button
                      onClick={() => { setCompanySettings(prev => prev ? { ...prev, logo_url: null } : null); setPreview(null); }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      <X size={16} /> Supprimer
                    </button>
                  )}
                  <p className="text-xs text-gray-400">PNG, JPG, SVG · Max 2 Mo</p>
                  {uploadError && (
                    <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{uploadError}</p>
                  )}
                </div>
              </div>

              {/* Raison sociale + tagline */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelClass}>Raison sociale</label>
                  <input type="text" value={companySettings.raison_sociale ?? ''} onChange={e => updateField('raison_sociale', e.target.value || null)}
                    placeholder="BDK FOOD SARL" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Sous-titre</label>
                  <input type="text" value={companySettings.company_tagline ?? ''} onChange={e => updateField('company_tagline', e.target.value || null)}
                    placeholder="Boulangerie | Pâtisserie | Chocolat" className={inputClass} />
                </div>
              </div>

              {/* Identifiants légaux */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Identifiants légaux</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>R.C</label>
                    <input type="text" value={companySettings.rc ?? ''} onChange={e => updateField('rc', e.target.value || null)} placeholder="151343" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>E-mail</label>
                    <input type="email" value={companySettings.email_societe ?? ''} onChange={e => updateField('email_societe', e.target.value || null)} placeholder="contact@entreprise.com" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>I.C.E</label>
                    <input type="text" value={companySettings.ice_societe ?? ''} onChange={e => updateField('ice_societe', e.target.value || null)} placeholder="003524755000061" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Téléphone</label>
                    <input type="tel" value={companySettings.telephone_societe ?? ''} onChange={e => updateField('telephone_societe', e.target.value || null)} placeholder="0600414890" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>I.F</label>
                    <input type="text" value={companySettings.if_fiscal ?? ''} onChange={e => updateField('if_fiscal', e.target.value || null)} placeholder="660040481" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Site Web</label>
                    <input type="text" value={companySettings.site_web ?? ''} onChange={e => updateField('site_web', e.target.value || null)} placeholder="www.entreprise.com" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>C.N.S.S</label>
                    <input type="text" value={companySettings.cnss ?? ''} onChange={e => updateField('cnss', e.target.value || null)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>T.P</label>
                    <input type="text" value={companySettings.tp ?? ''} onChange={e => updateField('tp', e.target.value || null)} placeholder="64006880" className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Adresse */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Adresse du siège</p>
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Adresse</label>
                    <textarea value={companySettings.adresse_siege ?? ''} onChange={e => updateField('adresse_siege', e.target.value || null)}
                      placeholder="Lot 911, Al Massar" rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>Code postal</label>
                      <input type="text" value={companySettings.code_postal ?? ''} onChange={e => updateField('code_postal', e.target.value || null)} placeholder="40000" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Ville</label>
                      <input type="text" value={companySettings.ville_siege ?? ''} onChange={e => updateField('ville_siege', e.target.value || null)} placeholder="Marrakech" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Pays</label>
                      <input type="text" value={companySettings.pays ?? 'Maroc'} onChange={e => updateField('pays', e.target.value || null)} placeholder="Maroc" className={inputClass} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Connexion WooCommerce (entreprises secondaires uniquement) ────────── */}
      {!isMainCompany && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
              <Link2 size={18} className="text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Connexion WooCommerce</h2>
              <p className="text-xs text-gray-400 mt-0.5">Liez votre boutique WordPress pour synchroniser produits et commandes</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Guide rapide */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-800 space-y-1">
              <p className="font-semibold">Comment obtenir vos clés API ?</p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs text-purple-700">
                <li>Allez dans <strong>WooCommerce → Réglages → Avancé → API REST</strong></li>
                <li>Cliquez <strong>Ajouter une clé</strong></li>
                <li>Sélectionnez <strong>Lecture/Écriture</strong> comme permissions</li>
                <li>Copiez la Consumer Key et le Consumer Secret ci-dessous</li>
              </ol>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>URL du site WordPress</label>
                <input
                  type="url"
                  value={woo.url}
                  onChange={e => setWoo(w => ({ ...w, url: e.target.value }))}
                  placeholder="https://mazette.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Consumer Key</label>
                <input
                  type="text"
                  value={woo.key}
                  onChange={e => setWoo(w => ({ ...w, key: e.target.value }))}
                  placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className={inputClass + ' font-mono text-xs'}
                />
              </div>
              <div>
                <label className={labelClass}>Consumer Secret</label>
                <input
                  type="password"
                  value={woo.secret}
                  onChange={e => setWoo(w => ({ ...w, secret: e.target.value }))}
                  placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className={inputClass + ' font-mono text-xs'}
                />
              </div>
            </div>

            {/* Résultat test */}
            {wooTestResult && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
                wooTestResult === 'ok'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {wooTestResult === 'ok'
                  ? <ShieldCheck size={16} className="shrink-0" />
                  : <ShieldX size={16} className="shrink-0" />
                }
                {wooTestMsg}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTestWoo}
                disabled={testingWoo || !woo.url || !woo.key || !woo.secret}
                className="flex items-center gap-2 px-4 py-2.5 border border-purple-300 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-50 disabled:opacity-40 transition-colors"
              >
                {testingWoo ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                Tester la connexion
              </button>
              <button
                onClick={handleSaveWoo}
                disabled={savingWoo}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingWoo ? <><Loader2 size={15} className="animate-spin" /> Enregistrement…</> : savedWoo ? <><Check size={15} /> Enregistré</> : 'Sauvegarder'}
              </button>
            </div>

            {/* ── Synchronisation ─────────────────────────────────────────── */}
            {(company?.woocommerce_url || woo.url) && (
              <div className="border-t border-gray-100 pt-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Synchronisation</p>
                  <p className="text-xs text-gray-400 mt-0.5">Importe les données depuis WooCommerce dans le catalogue BDK</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleSync('products')}
                    disabled={syncing || !woo.key}
                    className="flex flex-col items-center gap-1.5 p-3 border border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 transition-colors text-center"
                  >
                    <Package size={18} className="text-purple-600" />
                    <span className="text-xs font-medium text-gray-700">Produits</span>
                    <span className="text-[10px] text-gray-400">+ catégories</span>
                  </button>
                  <button
                    onClick={() => handleSync('customers')}
                    disabled={syncing || !woo.key}
                    className="flex flex-col items-center gap-1.5 p-3 border border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 transition-colors text-center"
                  >
                    <Users size={18} className="text-purple-600" />
                    <span className="text-xs font-medium text-gray-700">Clients</span>
                    <span className="text-[10px] text-gray-400">comptes WC</span>
                  </button>
                  <button
                    onClick={() => handleSync('all')}
                    disabled={syncing || !woo.key}
                    className="flex flex-col items-center gap-1.5 p-3 border border-purple-200 bg-purple-50 rounded-xl hover:bg-purple-100 disabled:opacity-40 transition-colors text-center"
                  >
                    <RefreshCw size={18} className={`text-purple-600 ${syncing ? 'animate-spin' : ''}`} />
                    <span className="text-xs font-semibold text-purple-700">Tout sync</span>
                    <span className="text-[10px] text-purple-500">produits + clients</span>
                  </button>
                </div>

                {syncing && (
                  <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-4 py-3 rounded-xl">
                    <Loader2 size={15} className="animate-spin shrink-0" />
                    Synchronisation en cours… cela peut prendre quelques secondes
                  </div>
                )}

                {syncResult && !syncing && (
                  <div className={`rounded-xl p-4 space-y-2 ${syncResult.errors.length > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
                    <p className="text-sm font-semibold text-gray-800">Résultat de la synchronisation</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {syncResult.categories > 0 && <span className="text-green-700">✓ {syncResult.categories} catégorie{syncResult.categories > 1 ? 's' : ''} importée{syncResult.categories > 1 ? 's' : ''}</span>}
                      {syncResult.products > 0 && <span className="text-green-700">✓ {syncResult.products} produit{syncResult.products > 1 ? 's' : ''} importé{syncResult.products > 1 ? 's' : ''}</span>}
                      {syncResult.articles > 0 && <span className="text-green-700">✓ {syncResult.articles} article{syncResult.articles > 1 ? 's' : ''} importé{syncResult.articles > 1 ? 's' : ''}</span>}
                      {syncResult.customers > 0 && <span className="text-green-700">✓ {syncResult.customers} client{syncResult.customers > 1 ? 's' : ''} importé{syncResult.customers > 1 ? 's' : ''}</span>}
                      {syncResult.categories === 0 && syncResult.products === 0 && syncResult.customers === 0 && syncResult.errors.length === 0 && (
                        <span className="text-gray-500 col-span-2">Tout est déjà à jour — aucune nouvelle donnée à importer</span>
                      )}
                    </div>
                    {syncResult.errors.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-orange-200">
                        {syncResult.errors.map((e, i) => (
                          <p key={i} className="text-xs text-orange-700 flex items-start gap-1">
                            <AlertCircle size={11} className="shrink-0 mt-0.5" />{e}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sections globales (entreprise principale uniquement) ─────────────── */}
      {isMainCompany && (<>

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
        <button onClick={handleSaveDelivery} disabled={savingDelivery}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Heure limite de commande</label>
          <div className="flex items-center gap-3">
            <input type="time"
              value={(settings.portal_order_deadline as string | undefined)?.slice(0, 5) ?? '18:00'}
              onChange={async e => { await updateSettings({ portal_order_deadline: e.target.value + ':00' } as any); }}
              className="px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base" />
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
          <button onClick={handleSaveLanding} disabled={savingLanding}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {savingLanding ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : savedLanding ? <><Check size={14} /> Enregistré</> : 'Sauvegarder'}
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Titre principal</label>
            <input type="text" value={landingTitle} onChange={e => setLandingTitle(e.target.value)} placeholder="BDK Food" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Sous-titre</label>
            <input type="text" value={landingSubtitle} onChange={e => setLandingSubtitle(e.target.value)} placeholder="Artisan boulanger · Pâtissier · Chocolatier" className={inputClass} />
          </div>
        </div>
      </div>

      </>)}
    </div>
  );
}
