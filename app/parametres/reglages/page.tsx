'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, X, Check, Loader2, Clock, Calendar, AlertCircle,
  Building2, Globe, Monitor, Link2, ShieldCheck, ShieldX,
  RefreshCw, Package, Users, ShoppingCart, Pencil, Plus, Trash2,
  Truck, Eye, EyeOff,
} from 'lucide-react';
import { JourFerie } from '@/lib/feries-maroc';
import { useAppSettings, ClientTypeDelivery, ClientTypeSettings } from '@/lib/useAppSettings';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES } from '@/types';
import Image from 'next/image';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface DeliverySlot { id: string; name: string; start_time: string; end_time: string; }
interface Company { id: string; name: string; slug: string; woocommerce_url: string | null; woocommerce_key: string | null; woocommerce_secret: string | null; }
interface CompanySettings {
  id?: number; company_id: string; company_name: string; company_tagline: string | null;
  logo_url: string | null; raison_sociale: string | null; rc: string | null;
  ice_societe: string | null; if_fiscal: string | null; cnss: string | null; tp: string | null;
  email_societe: string | null; telephone_societe: string | null; site_web: string | null;
  adresse_siege: string | null; code_postal: string | null; ville_siege: string | null; pays: string | null;
}

const EMPTY_COMPANY_SETTINGS = (company_id: string): CompanySettings => ({
  company_id, company_name: '', company_tagline: null, logo_url: null, raison_sociale: null,
  rc: null, ice_societe: null, if_fiscal: null, cnss: null, tp: null,
  email_societe: null, telephone_societe: null, site_web: null,
  adresse_siege: null, code_postal: null, ville_siege: null, pays: 'Maroc',
});

const DELIVERY_TYPES = CLIENT_TYPES.filter(t => t.value !== 'autre');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SaveBtn({ onClick, saving, saved, disabled, label = 'Sauvegarder' }: {
  onClick: () => void; saving: boolean; saved: boolean; disabled?: boolean; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
        transition-all duration-200 disabled:opacity-50 select-none
        ${saved
          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
          : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm shadow-blue-200'
        }
      `}
    >
      {saving
        ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
        : saved
        ? <><Check size={14} /> Enregistré</>
        : label}
    </button>
  );
}

// ─── Section header helper ────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{label}</p>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

// ─── Composant jours fériés éditable ──────────────────────────────────────────

const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
type FerieForm = { type: 'fixe' | 'islamique'; label: string; month: string; day: string; date: string };
const EMPTY_FORM: FerieForm = { type: 'islamique', label: '', month: '1', day: '1', date: '' };

function FeriesSection() {
  const [feries, setFeries]     = useState<JourFerie[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState<FerieForm | null>(null);
  const [editId, setEditId]     = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('jours_feries').select('*').order('type').order('month').order('day').order('date');
    setFeries((data ?? []) as JourFerie[]);
    setLoading(false);
  }

  function startAdd() { setEditId(null); setForm({ ...EMPTY_FORM }); }
  function startEdit(f: JourFerie) {
    setEditId(f.id);
    setForm({ type: f.type, label: f.label, month: String(f.month ?? 1), day: String(f.day ?? 1), date: f.date ?? '' });
  }
  function cancelForm() { setForm(null); setEditId(null); }

  async function save() {
    if (!form) return;
    setSaving(true);
    const payload: Partial<JourFerie> = {
      type: form.type, label: form.label.trim(),
      month: form.type === 'fixe' ? Number(form.month) : null,
      day:   form.type === 'fixe' ? Number(form.day)   : null,
      date:  form.type === 'islamique' ? form.date || null : null,
    };
    if (editId) await supabase.from('jours_feries').update(payload).eq('id', editId);
    else        await supabase.from('jours_feries').insert(payload);
    setSaving(false); setForm(null); setEditId(null); load();
  }

  async function del(id: string) {
    setDeleting(id);
    await supabase.from('jours_feries').delete().eq('id', id);
    setDeleting(null); load();
  }

  const fixes      = feries.filter(f => f.type === 'fixe');
  const islamiques = feries.filter(f => f.type === 'islamique');
  const years      = [...new Set(islamiques.map(f => f.date?.slice(0,4)).filter(Boolean))].sort();
  const inp        = "border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white transition";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Jours fériés marocains</h2>
          <p className="text-xs text-gray-400 mt-0.5">Référence utilisée dans le planning, les pointages et le calendrier</p>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-2 px-3.5 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors shadow-sm shadow-green-200"
        >
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {/* Formulaire */}
      {form && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-bold text-gray-800">{editId ? 'Modifier le jour férié' : 'Nouveau jour férié'}</p>
          <div className="flex gap-2">
            {(['fixe','islamique'] as const).map(t => (
              <button key={t} onClick={() => setForm(f => f ? {...f, type: t} : f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${form.type === t ? 'bg-green-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {t === 'fixe' ? 'Date fixe (jour/mois)' : 'Date exacte'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nom</label>
            <input value={form.label} onChange={e => setForm(f => f ? {...f, label: e.target.value} : f)}
              placeholder="Fête du Trône" className={inp + ' w-full'} />
          </div>
          {form.type === 'fixe' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Jour</label>
                <input type="number" min={1} max={31} value={form.day}
                  onChange={e => setForm(f => f ? {...f, day: e.target.value} : f)} className={inp + ' w-full'} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mois</label>
                <select value={form.month} onChange={e => setForm(f => f ? {...f, month: e.target.value} : f)} className={inp + ' w-full'}>
                  {MOIS_COURTS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date exacte</label>
              <input type="date" value={form.date} onChange={e => setForm(f => f ? {...f, date: e.target.value} : f)} className={inp + ' w-full'} />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving || !form.label.trim() || (form.type === 'islamique' && !form.date)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={cancelForm} className="px-4 py-2 text-gray-600 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">Annuler</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {/* Fixes */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar size={12} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Fêtes nationales</p>
                <p className="text-[10px] text-gray-400">Même date chaque année</p>
              </div>
              <span className="ml-auto text-xs font-bold text-blue-400 tabular-nums">{fixes.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {fixes.length === 0 && (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">Aucune fête nationale</p>
              )}
              {fixes.map(f => (
                <div key={f.id} className="flex items-center justify-between px-4 py-2.5 group hover:bg-gray-50 transition-colors">
                  <span className="text-sm text-gray-800">{f.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-500 tabular-nums bg-blue-50 px-2 py-0.5 rounded-lg">
                      {String(f.day).padStart(2,'0')}/{String(f.month).padStart(2,'0')}
                    </span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(f)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={12} /></button>
                      <button onClick={() => del(f.id)} disabled={deleting === f.id} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        {deleting === f.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Islamiques */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-white flex items-center gap-2">
              <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center">
                <Calendar size={12} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Fêtes islamiques</p>
                <p className="text-[10px] text-amber-600">Dates approx. · observation de la lune</p>
              </div>
              <span className="ml-auto text-xs font-bold text-green-400 tabular-nums">{islamiques.length}</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {islamiques.length === 0 && (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">Aucune fête islamique</p>
              )}
              {years.map(year => (
                <div key={year}>
                  <div className="px-4 py-1.5 bg-gray-50 sticky top-0 z-10">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{year}</p>
                  </div>
                  {islamiques.filter(f => f.date?.startsWith(year!)).map(f => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-2.5 group hover:bg-green-50 transition-colors">
                      <span className="text-sm text-gray-800">{f.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-green-600 tabular-nums bg-green-50 px-2 py-0.5 rounded-lg">
                          {f.date ? (() => { const [,m,d] = f.date!.split('-'); return `${d}/${m}`; })() : ''}
                        </span>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(f)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={12} /></button>
                          <button onClick={() => del(f.id)} disabled={deleting === f.id} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            {deleting === f.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

type NavTab = 'entreprise' | 'livraison' | 'woocommerce' | 'feries';

export default function ReglagesPage() {
  const { settings, updateSettings } = useAppSettings();
  const [activeTab, setActiveTab] = useState<NavTab>('entreprise');

  // ── Entreprises ────────────────────────────────────────────────────────────
  const [companies, setCompanies]         = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companySettings, setCompanySettings]     = useState<CompanySettings | null>(null);
  const [loadingCompany, setLoadingCompany]       = useState(false);
  const [savingEntreprise, setSavingEntreprise]   = useState(false);
  const [savedEntreprise, setSavedEntreprise]     = useState(false);
  const [errorEntreprise, setErrorEntreprise]     = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview]       = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── WooCommerce ────────────────────────────────────────────────────────────
  const [woo, setWoo]                   = useState({ url: '', key: '', secret: '' });
  const [savingWoo, setSavingWoo]       = useState(false);
  const [savedWoo, setSavedWoo]         = useState(false);
  const [testingWoo, setTestingWoo]     = useState(false);
  const [wooTestResult, setWooTestResult] = useState<'ok' | 'error' | null>(null);
  const [wooTestMsg, setWooTestMsg]     = useState('');
  const [syncing, setSyncing]           = useState(false);
  const [syncResult, setSyncResult]     = useState<{ categories: number; products: number; articles: number; customers: number; orders: number; errors: string[] } | null>(null);
  const [showKey, setShowKey]           = useState(false);
  const [showSecret, setShowSecret]     = useState(false);

  // ── Livraison ──────────────────────────────────────────────────────────────
  const [slots, setSlots]               = useState<DeliverySlot[]>([]);
  const [typeSettings, setTypeSettings] = useState<ClientTypeSettings>({});
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savedDelivery, setSavedDelivery]   = useState(false);

  // ── Landing ────────────────────────────────────────────────────────────────
  const [landingTitle, setLandingTitle]       = useState('');
  const [landingSubtitle, setLandingSubtitle] = useState('');
  const [savingLanding, setSavingLanding]     = useState(false);
  const [savedLanding, setSavedLanding]       = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    supabase.from('companies').select('id, name, slug, woocommerce_url, woocommerce_key, woocommerce_secret').order('created_at')
      .then(({ data }: { data: Company[] | null }) => {
        const list = data || [];
        setCompanies(list);
        if (list.length > 0) setSelectedCompanyId(list[0].id);
      });
    supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }: { data: DeliverySlot[] | null }) => setSlots(data || []));
  }, []);

  if (!initialized.current && settings.company_name) {
    initialized.current = true;
    setTypeSettings(settings.client_type_settings ?? {});
    setLandingTitle(settings.landing_title ?? settings.company_name ?? '');
    setLandingSubtitle(settings.landing_subtitle ?? settings.company_tagline ?? '');
  }

  useEffect(() => {
    const company = companies.find(c => c.id === selectedCompanyId);
    if (company) {
      setWoo({ url: company.woocommerce_url ?? '', key: company.woocommerce_key ?? '', secret: company.woocommerce_secret ?? '' });
      setWooTestResult(null); setWooTestMsg('');
    }
  }, [selectedCompanyId, companies]);

  const loadCompanySettings = useCallback(async (companyId: string) => {
    setLoadingCompany(true); setPreview(null); setUploadError(null);
    const { data } = await supabase.from('app_settings').select('*').eq('company_id', companyId).maybeSingle();
    setCompanySettings(data ? (data as CompanySettings) : EMPTY_COMPANY_SETTINGS(companyId));
    setLoadingCompany(false);
  }, []);

  useEffect(() => { if (selectedCompanyId) loadCompanySettings(selectedCompanyId); }, [selectedCompanyId, loadCompanySettings]);

  function updateField(field: keyof CompanySettings, value: string | null) {
    setCompanySettings(prev => prev ? { ...prev, [field]: value } : null);
  }

  async function handleSaveEntreprise() {
    if (!companySettings) return;
    setSavingEntreprise(true); setErrorEntreprise(null);
    const payload = {
      company_id: companySettings.company_id,
      company_name: companySettings.raison_sociale || companySettings.company_name || '',
      company_tagline: companySettings.company_tagline, logo_url: companySettings.logo_url,
      raison_sociale: companySettings.raison_sociale, rc: companySettings.rc,
      ice_societe: companySettings.ice_societe, if_fiscal: companySettings.if_fiscal,
      cnss: companySettings.cnss, tp: companySettings.tp,
      email_societe: companySettings.email_societe, telephone_societe: companySettings.telephone_societe,
      site_web: companySettings.site_web, adresse_siege: companySettings.adresse_siege,
      code_postal: companySettings.code_postal, ville_siege: companySettings.ville_siege, pays: companySettings.pays,
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
    if (error) setErrorEntreprise((error as { message?: string }).message ?? 'Erreur');
    else { setSavedEntreprise(true); setTimeout(() => setSavedEntreprise(false), 2000); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companySettings) return;
    await uploadLogoFile(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function uploadLogoFile(file: File) {
    if (!companySettings) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    const company = companies.find(c => c.id === selectedCompanyId);
    const slug = company?.slug ?? 'company';
    const ext = file.name.split('.').pop();
    const path = `${slug}.${ext}`;
    const signRes = await fetch('/api/upload-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, bucket: 'logos' }) });
    const signData = await signRes.json();
    if (!signRes.ok) { setUploadError(signData.error); setUploading(false); return; }
    const { error: upError } = await supabase.storage.from('logos').uploadToSignedUrl(path, signData.token, file, { contentType: file.type });
    setUploading(false);
    if (upError) { setUploadError(upError.message); setPreview(null); return; }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
    setCompanySettings(prev => prev ? { ...prev, logo_url: `${publicUrl}?t=${Date.now()}` } : null);
    setPreview(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /image\/(png|jpeg|svg\+xml|webp)/.test(file.type)) uploadLogoFile(file);
  }

  async function handleSaveWoo() {
    setSavingWoo(true);
    const { error } = await supabase.from('companies').update({
      woocommerce_url: woo.url || null, woocommerce_key: woo.key || null, woocommerce_secret: woo.secret || null,
    }).eq('id', selectedCompanyId);
    setSavingWoo(false);
    if (error) { alert(`Erreur : ${error.message}`); return; }
    setCompanies(prev => prev.map(c => c.id === selectedCompanyId ? { ...c, woocommerce_url: woo.url || null, woocommerce_key: woo.key || null, woocommerce_secret: woo.secret || null } : c));
    setSavedWoo(true); setTimeout(() => setSavedWoo(false), 2000);
  }

  async function handleTestWoo() {
    if (!woo.url || !woo.key || !woo.secret) return;
    setTestingWoo(true); setWooTestResult(null);
    try {
      const base = woo.url.replace(/\/$/, '');
      const res = await fetch(`${base}/wp-json/wc/v3/system_status`, { headers: { Authorization: `Basic ${btoa(`${woo.key}:${woo.secret}`)}` } });
      if (res.ok) {
        const data = await res.json();
        setWooTestResult('ok'); setWooTestMsg(`Connexion réussie${data?.environment?.version ? ` · WooCommerce ${data.environment.version}` : ''}`);
      } else { setWooTestResult('error'); setWooTestMsg(`Erreur ${res.status} — vérifiez l'URL et les clés API`); }
    } catch { setWooTestResult('error'); setWooTestMsg("Impossible de joindre le site. Vérifiez l'URL et les CORS."); }
    setTestingWoo(false);
  }

  async function handleSync(sync_type: 'all' | 'products' | 'customers' | 'orders') {
    setSyncing(true); setSyncResult(null);
    const company = companies.find(c => c.id === selectedCompanyId);
    try {
      const res = await fetch('/api/woocommerce/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: selectedCompanyId, sync_type, woocommerce_url: woo.url || company?.woocommerce_url, woocommerce_key: woo.key || company?.woocommerce_key, woocommerce_secret: woo.secret || company?.woocommerce_secret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur sync');
      setSyncResult(data);
    } catch (e: any) { setSyncResult({ categories: 0, products: 0, articles: 0, customers: 0, orders: 0, errors: [e.message] }); }
    setSyncing(false);
  }

  function getTypeSetting(type: string): ClientTypeDelivery { return typeSettings[type] ?? { mode: 'creneau', heure: null, creneau_id: null }; }
  function updateTypeSetting(type: string, updates: Partial<ClientTypeDelivery>) { setTypeSettings(prev => ({ ...prev, [type]: { ...getTypeSetting(type), ...updates } })); }
  async function handleSaveDelivery() { setSavingDelivery(true); await updateSettings({ client_type_settings: typeSettings }); setSavingDelivery(false); setSavedDelivery(true); setTimeout(() => setSavedDelivery(false), 2000); }
  async function handleSaveLanding() { setSavingLanding(true); await updateSettings({ landing_title: landingTitle || null, landing_subtitle: landingSubtitle || null } as any); setSavingLanding(false); setSavedLanding(true); setTimeout(() => setSavedLanding(false), 2000); }

  const isMainCompany = companies.length > 0 && selectedCompanyId === companies[0]?.id;
  const currentLogo   = preview ?? companySettings?.logo_url;
  const company       = companies.find(c => c.id === selectedCompanyId);

  const inp = "w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1.5";

  type NavItem = { key: NavTab; icon: React.ReactNode; label: string; desc: string; color: string; bg: string; hidden?: boolean };
  const NAV: NavItem[] = [
    { key: 'entreprise',  icon: <Building2 size={16} />, label: 'Entreprise',       desc: 'Infos légales & logo',            color: 'text-blue-600',   bg: 'bg-blue-100' },
    { key: 'livraison',   icon: <Truck size={16} />,     label: 'Livraison',         desc: 'Créneaux & portail client',       color: 'text-amber-600',  bg: 'bg-amber-100' },
    { key: 'woocommerce', icon: <Link2 size={16} />,     label: 'WooCommerce',       desc: 'API & synchronisation',           color: 'text-purple-600', bg: 'bg-purple-100', hidden: isMainCompany },
    { key: 'feries',      icon: <Calendar size={16} />,  label: 'Jours fériés',      desc: 'Calendrier marocain',             color: 'text-green-600',  bg: 'bg-green-100' },
  ];

  return (
    <div className="max-w-5xl space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Réglages</h1>
        <p className="text-sm text-gray-400 mt-1">Personnalisation et configuration de l&apos;application</p>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Navigation rail ──────────────────────────────────────────────── */}
        <nav className="w-60 shrink-0 sticky top-6 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-2 flex-1">
            {NAV.filter(n => !n.hidden).map((n, idx, arr) => (
              <div key={n.key}>
                <button
                  onClick={() => setActiveTab(n.key)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                    border-l-[3px]
                    ${activeTab === n.key
                      ? 'bg-blue-50 border-blue-600'
                      : 'border-transparent hover:bg-gray-50'
                    }
                  `}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.bg} ${n.color}`}>
                    {n.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${activeTab === n.key ? 'text-blue-700' : 'text-gray-800'}`}>{n.label}</p>
                    <p className="text-[11px] text-gray-400 leading-tight mt-0.5 truncate">{n.desc}</p>
                  </div>
                </button>
                {idx < arr.length - 1 && (
                  <div className="mx-3 my-1 h-px bg-gray-100" />
                )}
              </div>
            ))}
          </div>

          {/* Version block */}
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Version</p>
            <p className="text-xs text-gray-500 mt-0.5">BDK ERP · v1.0</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Dernière mise à jour : 2025</p>
          </div>
        </nav>

        {/* ── Contenu ────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ══════════════════════════════════════════════════════════════════
              TAB: ENTREPRISE
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'entreprise' && (
            <div className="space-y-5">

              {/* Hero banner */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl overflow-hidden relative h-28 shadow-md shadow-blue-200">
                <div className="absolute inset-0 px-6 flex items-center justify-between">
                  <div>
                    <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">Entreprise</p>
                    <h2 className="text-white text-xl font-bold leading-tight">
                      {companySettings?.raison_sociale || company?.name || 'Mon entreprise'}
                    </h2>
                    {companySettings?.company_tagline && (
                      <p className="text-blue-200 text-sm mt-0.5">{companySettings.company_tagline}</p>
                    )}
                  </div>
                  {currentLogo && (
                    <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 overflow-hidden flex items-center justify-center shrink-0">
                      <Image src={currentLogo} alt="Logo" width={64} height={64} className="w-full h-full object-contain" />
                    </div>
                  )}
                  {!currentLogo && (
                    <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shrink-0">
                      <span className="text-3xl font-bold text-white/80">
                        {(companySettings?.raison_sociale || company?.name || 'B').charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                {/* subtle grid pattern */}
                <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              </div>

              {/* Company tabs (if multiple) */}
              {companies.length > 1 && (
                <div className="flex gap-2">
                  {companies.map(c => (
                    <button key={c.id} onClick={() => setSelectedCompanyId(c.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        selectedCompanyId === c.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                      }`}>
                      <Building2 size={11} />{c.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Main settings card */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                {/* Card header with sticky save */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Informations légales</p>
                    <p className="text-xs text-gray-400 mt-0.5">Affichées sur les bons de livraison et factures</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <SaveBtn onClick={handleSaveEntreprise} saving={savingEntreprise} saved={savedEntreprise} disabled={loadingCompany} />
                  </div>
                </div>

                {errorEntreprise && (
                  <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertCircle size={14} className="shrink-0" /> {errorEntreprise}
                  </div>
                )}

                {loadingCompany ? (
                  <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
                ) : companySettings ? (
                  <div className="p-6 space-y-8">

                    {/* Logo upload — drag & drop zone */}
                    <div>
                      <SectionHeader label="Logo" />
                      <div className="flex items-start gap-6">
                        {/* Drop zone */}
                        <div
                          onClick={() => !uploading && fileRef.current?.click()}
                          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={handleDrop}
                          className={`
                            w-36 h-36 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center
                            overflow-hidden cursor-pointer transition-all shrink-0 relative
                            ${dragOver
                              ? 'border-blue-500 bg-blue-50 scale-[1.02]'
                              : currentLogo
                                ? 'border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50'
                                : 'border-gray-200 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
                            }
                          `}
                        >
                          {currentLogo ? (
                            <>
                              <Image src={currentLogo} alt="Logo" width={144} height={144} className="w-full h-full object-contain" />
                              <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors rounded-2xl flex items-center justify-center">
                                {uploading && (
                                  <div className="bg-white/80 rounded-full p-2">
                                    <Loader2 size={18} className="animate-spin text-blue-600" />
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              {uploading ? (
                                <Loader2 size={24} className="animate-spin text-blue-400" />
                              ) : (
                                <>
                                  <Upload size={22} className="text-gray-300 mb-2" />
                                  <span className="text-[11px] text-gray-400 text-center px-2 leading-tight">
                                    {dragOver ? 'Déposer ici' : 'Glisser ou cliquer'}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                        </div>

                        <div className="space-y-3 pt-1">
                          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleFileChange} />
                          <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {uploading ? <><Loader2 size={14} className="animate-spin" /> Envoi en cours…</> : <><Upload size={14} /> Choisir un fichier</>}
                          </button>
                          {currentLogo && (
                            <button
                              onClick={() => { setCompanySettings(prev => prev ? { ...prev, logo_url: null } : null); setPreview(null); }}
                              className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-200 bg-red-50 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                            >
                              <X size={14} /> Supprimer le logo
                            </button>
                          )}
                          <p className="text-xs text-gray-400">PNG, JPG, SVG ou WebP · Max 2 Mo</p>
                          {uploadError && (
                            <p className="text-xs text-red-600 flex items-center gap-1.5 bg-red-50 px-3 py-2 rounded-xl border border-red-100">
                              <AlertCircle size={12} className="shrink-0" /> {uploadError}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Identité */}
                    <div>
                      <SectionHeader label="Identité" />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className={lbl}>Raison sociale</label>
                          <input type="text" value={companySettings.raison_sociale ?? ''} onChange={e => updateField('raison_sociale', e.target.value || null)} placeholder="BDK FOOD SARL" className={inp} />
                        </div>
                        <div className="col-span-2">
                          <label className={lbl}>Tagline / Sous-titre</label>
                          <input type="text" value={companySettings.company_tagline ?? ''} onChange={e => updateField('company_tagline', e.target.value || null)} placeholder="Boulangerie · Pâtisserie · Chocolat" className={inp} />
                        </div>
                      </div>
                    </div>

                    {/* Identifiants légaux */}
                    <div>
                      <SectionHeader label="Identifiants légaux" />
                      <div className="grid grid-cols-4 gap-3">
                        {([
                          { label: 'R.C',       field: 'rc' as const,               placeholder: '151343' },
                          { label: 'I.C.E',     field: 'ice_societe' as const,      placeholder: '003524755000061' },
                          { label: 'I.F',       field: 'if_fiscal' as const,        placeholder: '660040481' },
                          { label: 'C.N.S.S',   field: 'cnss' as const,             placeholder: '' },
                          { label: 'T.P',       field: 'tp' as const,               placeholder: '64006880' },
                          { label: 'E-mail',    field: 'email_societe' as const,    placeholder: 'contact@entreprise.com' },
                          { label: 'Téléphone', field: 'telephone_societe' as const, placeholder: '0600414890' },
                          { label: 'Site Web',  field: 'site_web' as const,         placeholder: 'www.entreprise.com' },
                        ] as const).map(({ label, field, placeholder }) => (
                          <div key={field} className="group">
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
                            <input
                              type="text"
                              value={(companySettings[field] as string) ?? ''}
                              onChange={e => updateField(field, e.target.value || null)}
                              placeholder={placeholder}
                              className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition placeholder:text-gray-300"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Adresse */}
                    <div>
                      <SectionHeader label="Adresse du siège" />
                      <div className="space-y-3">
                        <div>
                          <label className={lbl}>Adresse</label>
                          <textarea
                            value={companySettings.adresse_siege ?? ''}
                            onChange={e => updateField('adresse_siege', e.target.value || null)}
                            placeholder="Lot 911, Al Massar"
                            rows={2}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className={lbl}>Code postal</label>
                            <input type="text" value={companySettings.code_postal ?? ''} onChange={e => updateField('code_postal', e.target.value || null)} placeholder="40000" className={inp} />
                          </div>
                          <div>
                            <label className={lbl}>Ville</label>
                            <input type="text" value={companySettings.ville_siege ?? ''} onChange={e => updateField('ville_siege', e.target.value || null)} placeholder="Marrakech" className={inp} />
                          </div>
                          <div>
                            <label className={lbl}>Pays</label>
                            <input type="text" value={companySettings.pays ?? 'Maroc'} onChange={e => updateField('pays', e.target.value || null)} placeholder="Maroc" className={inp} />
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: LIVRAISON & PORTAIL
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'livraison' && (
            <div className="space-y-5">
              {!isMainCompany && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">Ces réglages s&apos;appliquent uniquement à l&apos;entreprise principale (BDK Food).</p>
                </div>
              )}

              {isMainCompany && (
                <>
                  {/* Livraison par type de client */}
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                          <Truck size={17} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">Livraison par type de client</p>
                          <p className="text-xs text-gray-400 mt-0.5">Heure précise ou créneau horaire selon le type</p>
                        </div>
                      </div>
                      <SaveBtn onClick={handleSaveDelivery} saving={savingDelivery} saved={savedDelivery} label="Enregistrer" />
                    </div>

                    <div className="divide-y divide-gray-50">
                      {DELIVERY_TYPES.map(type => {
                        const cfg = getTypeSetting(type.value);
                        return (
                          <div key={type.value} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors">
                            {/* Type badge */}
                            <div className="w-32 shrink-0">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                                {type.label}
                              </span>
                            </div>

                            {/* Mode toggle */}
                            <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-xl shrink-0">
                              <button
                                onClick={() => updateTypeSetting(type.value, { mode: 'heure', creneau_id: null })}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all ${
                                  cfg.mode === 'heure' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <Clock size={11} /> Heure
                              </button>
                              <button
                                onClick={() => updateTypeSetting(type.value, { mode: 'creneau', heure: null })}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all ${
                                  cfg.mode === 'creneau' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <Calendar size={11} /> Créneau
                              </button>
                            </div>

                            {/* Input */}
                            <div className="flex-1">
                              {cfg.mode === 'heure' ? (
                                <input
                                  type="time"
                                  value={cfg.heure ?? ''}
                                  onChange={e => updateTypeSetting(type.value, { heure: e.target.value || null })}
                                  className="w-full px-3 py-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                />
                              ) : (
                                <select
                                  value={cfg.creneau_id ?? ''}
                                  onChange={e => updateTypeSetting(type.value, { creneau_id: e.target.value || null })}
                                  className="w-full px-3 py-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                >
                                  <option value="">— Aucun créneau —</option>
                                  {slots.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0,5)} – {s.end_time.slice(0,5)})</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Portail client */}
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                          <Globe size={17} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">Portail client</p>
                          <p className="text-xs text-gray-400 mt-0.5">Paramètres de commande en ligne</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex items-end gap-6">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Heure limite de commande
                          </label>
                          <input
                            type="time"
                            value={(settings.portal_order_deadline as string | undefined)?.slice(0,5) ?? '18:00'}
                            onChange={async e => { await updateSettings({ portal_order_deadline: e.target.value + ':00' } as any); }}
                            className="px-3 py-2.5 border border-gray-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition text-sm"
                          />
                        </div>
                        <p className="text-sm text-gray-400 pb-2.5 leading-relaxed">
                          Les commandes passées après cette heure seront<br />mises en attente de validation.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Page d'accueil publique */}
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                          <Monitor size={17} className="text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">Page d&apos;accueil publique</p>
                          <p className="text-xs text-gray-400 mt-0.5">Textes affichés sur bdkfood.com</p>
                        </div>
                      </div>
                      <SaveBtn onClick={handleSaveLanding} saving={savingLanding} saved={savedLanding} label="Sauvegarder" />
                    </div>
                    <div className="p-6 space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={lbl}>Titre principal</label>
                          <input type="text" value={landingTitle} onChange={e => setLandingTitle(e.target.value)} placeholder="BDK Food" className={inp} />
                        </div>
                        <div>
                          <label className={lbl}>Sous-titre</label>
                          <input type="text" value={landingSubtitle} onChange={e => setLandingSubtitle(e.target.value)} placeholder="Artisan boulanger · Pâtissier" className={inp} />
                        </div>
                      </div>

                      {/* Preview mockup */}
                      <div className="rounded-2xl border border-gray-200 overflow-hidden">
                        <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                          <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                          </div>
                          <p className="text-xs text-gray-400 mx-auto">bdkfood.com — aperçu</p>
                        </div>
                        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-8 py-10 text-center">
                          <p className="text-2xl font-bold text-white">{landingTitle || 'BDK Food'}</p>
                          <p className="text-slate-400 text-sm mt-2">{landingSubtitle || 'Artisan boulanger · Pâtissier'}</p>
                          <div className="mt-6 inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm">
                            Commander en ligne →
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: WOOCOMMERCE
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'woocommerce' && !isMainCompany && (
            <div className="space-y-5">
              {/* Header card */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                {/* Purple header */}
                <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                      <Link2 size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-bold">WooCommerce</p>
                      <p className="text-purple-200 text-xs mt-0.5">Synchronisation boutique WordPress</p>
                    </div>
                  </div>
                  {/* Connection status */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    wooTestResult === 'ok'
                      ? 'bg-green-500/20 text-green-200'
                      : wooTestResult === 'error'
                      ? 'bg-red-500/20 text-red-200'
                      : 'bg-white/10 text-purple-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      wooTestResult === 'ok' ? 'bg-green-400' : wooTestResult === 'error' ? 'bg-red-400' : 'bg-purple-300'
                    }`} />
                    {wooTestResult === 'ok' ? 'Connecté' : wooTestResult === 'error' ? 'Erreur' : 'Non testé'}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Guide */}
                  <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-purple-800">Comment obtenir vos clés API ?</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-purple-700">
                      <li>Allez dans <strong>WooCommerce → Réglages → Avancé → API REST</strong></li>
                      <li>Cliquez <strong>Ajouter une clé</strong></li>
                      <li>Sélectionnez <strong>Lecture/Écriture</strong> comme permissions</li>
                      <li>Copiez la Consumer Key et le Consumer Secret ci-dessous</li>
                    </ol>
                  </div>

                  {/* API fields */}
                  <div className="space-y-4">
                    <SectionHeader label="Connexion API" />
                    <div>
                      <label className={lbl}>URL du site WordPress</label>
                      <input type="url" value={woo.url} onChange={e => setWoo(w => ({...w, url: e.target.value}))} placeholder="https://mazette.com" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Consumer Key</label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={woo.key}
                          onChange={e => setWoo(w => ({...w, key: e.target.value}))}
                          placeholder="ck_xxxx…"
                          className={inp + ' font-mono text-xs pr-10'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>Consumer Secret</label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={woo.secret}
                          onChange={e => setWoo(w => ({...w, secret: e.target.value}))}
                          placeholder="cs_xxxx…"
                          className={inp + ' font-mono text-xs pr-10'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Test result banner */}
                  {wooTestResult && (
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
                      wooTestResult === 'ok'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {wooTestResult === 'ok'
                        ? <ShieldCheck size={16} className="shrink-0" />
                        : <ShieldX size={16} className="shrink-0" />}
                      {wooTestMsg}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTestWoo}
                      disabled={testingWoo || !woo.url || !woo.key || !woo.secret}
                      className="flex items-center gap-2 px-4 py-2.5 border border-purple-200 text-purple-700 bg-purple-50 rounded-xl text-sm font-medium hover:bg-purple-100 disabled:opacity-40 transition-colors"
                    >
                      {testingWoo ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Tester la connexion
                    </button>
                    <SaveBtn onClick={handleSaveWoo} saving={savingWoo} saved={savedWoo} label="Sauvegarder" />
                  </div>
                </div>
              </div>

              {/* Webhook card */}
              {selectedCompanyId && (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4">
                  <SectionHeader label="Webhook — commandes en temps réel" />
                  <p className="text-xs text-gray-500">Copiez cette URL dans <strong>WooCommerce → Avancé → Webhooks</strong></p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono text-gray-700 break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/woocommerce/webhook?company_id={selectedCompanyId}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/woocommerce/webhook?company_id=${selectedCompanyId}`)}
                      className="shrink-0 px-3 py-2.5 bg-gray-100 hover:bg-purple-100 hover:text-purple-700 rounded-xl text-xs font-medium text-gray-700 transition-colors"
                    >
                      Copier
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">Topic : <strong>Order created</strong> + <strong>Order updated</strong> · Delivery : JSON</p>
                </div>
              )}

              {/* Sync card */}
              {(company?.woocommerce_url || woo.url) && (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-5">
                  <SectionHeader label="Synchronisation" />
                  <p className="text-xs text-gray-500 -mt-3">Importe les données depuis WooCommerce dans le catalogue BDK</p>

                  <div className="grid grid-cols-4 gap-3">
                    {([
                      { type: 'products'  as const, icon: <Package size={20} />,    label: 'Produits',    sub: '+ catégories' },
                      { type: 'customers' as const, icon: <Users size={20} />,      label: 'Clients',     sub: 'via commandes WC' },
                      { type: 'orders'    as const, icon: <ShoppingCart size={20}/>, label: 'Commandes',   sub: 'historique WC' },
                      { type: 'all'       as const, icon: <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />, label: 'Tout sync', sub: 'complet', accent: true },
                    ]).map(({ type, icon, label, sub, accent }) => (
                      <button
                        key={type}
                        onClick={() => handleSync(type)}
                        disabled={syncing || !woo.key}
                        className={`
                          flex flex-col items-center gap-2 p-4 rounded-2xl disabled:opacity-40 transition-all text-center border
                          ${accent
                            ? 'border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 shadow-sm'
                            : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50'
                          }
                        `}
                      >
                        <span className={accent ? 'text-purple-600' : 'text-gray-500'}>{icon}</span>
                        <span className={`text-xs font-semibold ${accent ? 'text-purple-700' : 'text-gray-700'}`}>{label}</span>
                        <span className={`text-[10px] ${accent ? 'text-purple-500' : 'text-gray-400'}`}>{sub}</span>
                      </button>
                    ))}
                  </div>

                  {syncing && (
                    <div className="flex items-center gap-2.5 text-sm text-purple-700 bg-purple-50 border border-purple-100 px-4 py-3 rounded-xl">
                      <Loader2 size={14} className="animate-spin shrink-0" />
                      Synchronisation en cours — cela peut prendre quelques secondes…
                    </div>
                  )}

                  {syncResult && !syncing && (
                    <div className={`rounded-2xl p-5 space-y-3 ${syncResult.errors.length > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
                      <p className="text-sm font-bold text-gray-800">Résultat de la synchronisation</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {syncResult.categories > 0 && <span className="text-sm text-green-700 flex items-center gap-1.5"><Check size={13} className="text-green-500" />{syncResult.categories} catégorie{syncResult.categories > 1 ? 's' : ''}</span>}
                        {syncResult.products > 0 && <span className="text-sm text-green-700 flex items-center gap-1.5"><Check size={13} className="text-green-500" />{syncResult.products} produit{syncResult.products > 1 ? 's' : ''}</span>}
                        {syncResult.articles > 0 && <span className="text-sm text-green-700 flex items-center gap-1.5"><Check size={13} className="text-green-500" />{syncResult.articles} article{syncResult.articles > 1 ? 's' : ''}</span>}
                        {syncResult.customers > 0 && <span className="text-sm text-green-700 flex items-center gap-1.5"><Check size={13} className="text-green-500" />{syncResult.customers} client{syncResult.customers > 1 ? 's' : ''}</span>}
                        {syncResult.orders > 0 && <span className="text-sm text-green-700 flex items-center gap-1.5"><Check size={13} className="text-green-500" />{syncResult.orders} commande{syncResult.orders > 1 ? 's' : ''}</span>}
                        {syncResult.categories === 0 && syncResult.products === 0 && syncResult.customers === 0 && syncResult.orders === 0 && syncResult.errors.length === 0 && (
                          <span className="text-sm text-gray-500 col-span-2">Tout est déjà à jour</span>
                        )}
                      </div>
                      {syncResult.errors.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-orange-200">
                          {syncResult.errors.map((e, i) => (
                            <p key={i} className="text-xs text-orange-700 flex items-start gap-1.5">
                              <AlertCircle size={12} className="shrink-0 mt-0.5" />{e}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: JOURS FÉRIÉS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'feries' && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
              {/* Card header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                  <Calendar size={17} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Jours fériés</p>
                  <p className="text-xs text-gray-400 mt-0.5">Calendrier officiel marocain · fixe et islamique</p>
                </div>
              </div>
              <div className="p-6">
                <FeriesSection />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
