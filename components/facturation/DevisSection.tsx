'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Search, FileText, Printer, Pencil, Trash2, ChevronRight, X, Check, BookOpen, UserPlus, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import FactureModal from '@/components/facturation/FactureModal';
import type { FactureDoc } from '@/components/facturation/FacturePDF';
import type { Client } from '@/types';
import { nextRef, calcTotals } from '@/lib/facturation';
import { useToast } from '@/components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DevisItem {
  id?: string;
  designation: string;
  quantite: number;
  prix_ht: number;
  tva_pct: number;
  _libre?: boolean;
}

interface Devis {
  id: string;
  reference: string;
  statut: string;
  date_emission: string;
  date_validite: string | null;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  notes: string | null;
  conditions: string | null;
  client_id: string | null;
  order_id: string | null;
  clients: { nom: string; ice: string | null; adresse_livraison: string | null; code: string | null } | null;
  devis_items?: DevisItem[];
}

interface CatalogArticle {
  id: string;
  display_name: string;
  prix_pro: number | null;
  prix_particulier: number | null;
  custom_price: number | null;
  pack_type: string;
}

const STATUTS = [
  { value: 'brouillon', label: 'Brouillon', color: 'text-gray-600',  bg: 'bg-gray-100' },
  { value: 'envoye',    label: 'Envoyé',    color: 'text-blue-600',  bg: 'bg-blue-100' },
  { value: 'accepte',   label: 'Accepté',   color: 'text-green-600', bg: 'bg-green-100' },
  { value: 'refuse',    label: 'Refusé',    color: 'text-red-600',   bg: 'bg-red-100' },
  { value: 'converti',  label: 'Converti',  color: 'text-purple-600',bg: 'bg-purple-100' },
];

const VALIDITE_PRESETS = [
  { label: '1 semaine', days: 7 },
  { label: '15 jours',  days: 15 },
  { label: '1 mois',    days: 30 },
];

const EMPTY_ITEM: DevisItem = { designation: '', quantite: 1, prix_ht: 0, tva_pct: 20, _libre: true };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function articlePrice(a: CatalogArticle): number {
  return a.prix_pro ?? a.prix_particulier ?? a.custom_price ?? 0;
}

// ─── Composant ligne article ──────────────────────────────────────────────────

function ItemRow({ item, idx, catalog, onChange, onRemove }: {
  item: DevisItem;
  idx: number;
  catalog: CatalogArticle[];
  onChange: (idx: number, patch: Partial<DevisItem>) => void;
  onRemove: (idx: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const filtered = search.trim()
    ? catalog.filter(a => a.display_name.toLowerCase().includes(search.toLowerCase()))
    : catalog;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function selectArticle(a: CatalogArticle) {
    onChange(idx, { designation: a.display_name, prix_ht: articlePrice(a), _libre: false });
    setOpen(false);
    setSearch('');
  }

  const totalHT = item.quantite * item.prix_ht;
  const totalTTC = totalHT * (1 + item.tva_pct / 100);

  return (
    <div className="border-t border-gray-100 px-3 py-3 relative" ref={dropRef}>
      <div className="grid grid-cols-12 gap-2 items-center">

        {/* Désignation */}
        <div className="col-span-5 flex items-center gap-1.5">
          {item._libre ? (
            <>
              <input
                value={item.designation}
                onChange={e => onChange(idx, { designation: e.target.value })}
                placeholder="Désignation libre…"
                className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
              <button type="button" title="Choisir dans le catalogue" onClick={() => setOpen(true)}
                className="shrink-0 p-2 rounded-lg text-gray-300 hover:text-purple-500 hover:bg-purple-50 transition-colors">
                <BookOpen size={15} />
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 min-w-0 text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 truncate block">
                {item.designation}
              </span>
              <button type="button" title="Saisie libre" onClick={() => onChange(idx, { _libre: true })}
                className="shrink-0 p-2 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <Pencil size={13} />
              </button>
            </>
          )}
        </div>

        {/* Qté */}
        <div className="col-span-2">
          <input type="number" min="0" step="0.001" value={item.quantite}
            onChange={e => onChange(idx, { quantite: parseFloat(e.target.value) || 0 })}
            className="w-full text-sm text-center border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
        </div>

        {/* P.U. HT */}
        <div className="col-span-2 relative">
          <input type="number" min="0" step="0.01" value={item.prix_ht}
            onChange={e => onChange(idx, { prix_ht: parseFloat(e.target.value) || 0 })}
            className="w-full text-sm text-right border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none select-none">MAD</span>
        </div>

        {/* TVA */}
        <div className="col-span-1">
          <select value={item.tva_pct} onChange={e => onChange(idx, { tva_pct: parseFloat(e.target.value) })}
            className="w-full text-sm text-center border border-gray-200 rounded-lg px-1 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value={0}>0%</option>
            <option value={10}>10%</option>
            <option value={20}>20%</option>
          </select>
        </div>

        {/* Total HT */}
        <div className="col-span-1 text-right pr-1">
          <span className="text-sm font-semibold text-gray-700 tabular-nums">{formatPrice(totalHT)}</span>
        </div>

        {/* Supprimer */}
        <div className="col-span-1 flex justify-end">
          <button onClick={() => onRemove(idx)}
            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Dropdown catalogue */}
      {open && (
        <div className="absolute left-3 top-full mt-1 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
              <Search size={13} className="text-gray-400 shrink-0" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un article…"
                className="flex-1 text-sm bg-transparent focus:outline-none" />
              <button onClick={() => setOpen(false)} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Aucun article trouvé</p>
            ) : filtered.map(a => (
              <button key={a.id} type="button" onClick={() => selectArticle(a)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-purple-50 text-left transition-colors gap-3">
                <span className="text-sm text-gray-800 truncate flex-1">{a.display_name}</span>
                <span className="text-xs font-bold text-purple-600 shrink-0">{formatPrice(articlePrice(a))}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 p-2">
            <button type="button"
              onClick={() => { setOpen(false); onChange(idx, { _libre: true, designation: search }); setSearch(''); }}
              className="w-full text-xs text-purple-600 hover:text-purple-700 font-semibold py-1.5 text-center hover:bg-purple-50 rounded-lg transition-colors">
              + Saisir &quot;{search || '…'}&quot; librement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sélecteur de validité ────────────────────────────────────────────────────

function ValiditeSelector({ emissionDate, value, onChange }: {
  emissionDate: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);

  // Détecter quel preset correspond à la valeur actuelle
  function activePreset(): number | null {
    if (!value || !emissionDate) return null;
    const diff = Math.round((new Date(value).getTime() - new Date(emissionDate).getTime()) / 86400000);
    return VALIDITE_PRESETS.find(p => p.days === diff) ? diff : null;
  }

  function selectPreset(days: number) {
    const d = addDays(emissionDate || localDateStr(), days);
    onChange(d);
    setShowCustom(false);
  }

  const active = activePreset();

  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
        <Calendar size={11} /> Validité
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2 items-center">
        {VALIDITE_PRESETS.map(p => (
          <button key={p.days} type="button"
            onClick={() => selectPreset(p.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              active === p.days
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>
            {p.label}
          </button>
        ))}
        <button type="button"
          onClick={() => setShowCustom(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 ${
            showCustom || (value && active === null)
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}>
          <Calendar size={11} />
          {value && active === null ? formatDate(value) : 'Autre date'}
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setShowCustom(false); }}
            className="text-gray-300 hover:text-gray-500 p-1">
            <X size={12} />
          </button>
        )}
      </div>
      {showCustom && (
        <div className="mt-2">
          <input type="date" value={value}
            onChange={e => { onChange(e.target.value); }}
            min={emissionDate}
            className="border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {value && (
            <span className="ml-2 text-xs text-gray-400">jusqu'au {formatDate(value)}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function DevisSection() {
  const [devis, setDevis]     = useState<Devis[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalog, setCatalog] = useState<CatalogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]    = useState<Devis | null>(null);
  const [pdfDoc, setPdfDoc]      = useState<FactureDoc | null>(null);
  const { settings } = useAppSettings();
  const { toast } = useToast();

  // Form
  const [formClientId, setFormClientId]         = useState('');
  const [formDateEmission, setFormDateEmission] = useState(localDateStr());
  const [formDateValidite, setFormDateValidite] = useState('');
  const [formNotes, setFormNotes]               = useState('');
  const [formConditions, setFormConditions]     = useState('');
  const [formItems, setFormItems]               = useState<DevisItem[]>([{ ...EMPTY_ITEM }]);
  const [saving, setSaving]                     = useState(false);

  // Création rapide client
  const [quickClient, setQuickClient] = useState(false);
  const [qcNom, setQcNom]     = useState('');
  const [qcTel, setQcTel]     = useState('');
  const [qcEmail, setQcEmail] = useState('');
  const [qcSaving, setQcSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [devisRes, clientsRes, catalogRes] = await Promise.all([
      supabase.from('devis').select('*, clients(nom, ice, adresse_livraison, code), devis_items(*)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, nom, ice, adresse_livraison, code').eq('is_active', true).order('nom'),
      supabase.from('product_articles').select('id, display_name, prix_pro, prix_particulier, custom_price, pack_type').eq('is_active', true).order('display_name'),
    ]);
    setDevis(devisRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setCatalog(catalogRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Création rapide client ────────────────────────────────────────────────
  async function saveQuickClient() {
    if (!qcNom.trim()) return;
    setQcSaving(true);
    const { data, error } = await supabase.from('clients')
      .insert({ nom: qcNom.trim(), telephone: qcTel || null, email: qcEmail || null, is_active: true, type_client: 'autre', jours_livraison: [] })
      .select('id, nom, ice, adresse_livraison, code').single();
    if (!error && data) {
      setClients(prev => [...prev, data as Client].sort((a, b) => a.nom.localeCompare(b.nom)));
      setFormClientId(data.id);
      setQuickClient(false);
      setQcNom(''); setQcTel(''); setQcEmail('');
    }
    setQcSaving(false);
  }

  // ── Formulaire devis ──────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setFormClientId('');
    setFormDateEmission(localDateStr());
    setFormDateValidite('');
    setFormNotes('');
    setFormConditions('');
    setFormItems([{ ...EMPTY_ITEM }]);
    setQuickClient(false);
    setModalOpen(true);
  }

  function openEdit(d: Devis) {
    setEditing(d);
    setFormClientId(d.client_id ?? '');
    setFormDateEmission(d.date_emission);
    setFormDateValidite(d.date_validite ?? '');
    setFormNotes(d.notes ?? '');
    setFormConditions(d.conditions ?? '');
    setFormItems(d.devis_items?.map(i => ({
      id: i.id, designation: i.designation, quantite: i.quantite, prix_ht: i.prix_ht, tva_pct: i.tva_pct, _libre: true,
    })) ?? [{ ...EMPTY_ITEM }]);
    setQuickClient(false);
    setModalOpen(true);
  }

  function updateItem(idx: number, patch: Partial<DevisItem>) {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  async function handleSave() {
    if (!formClientId || formItems.some(i => !i.designation)) return;
    setSaving(true);
    const totals = calcTotals(formItems);
    const payload = {
      client_id: formClientId,
      date_emission: formDateEmission,
      date_validite: formDateValidite || null,
      notes: formNotes || null,
      conditions: formConditions || null,
      ...totals,
    };
    if (editing) {
      const { error } = await supabase.from('devis').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast.error(`Erreur : ${error.message}`); setSaving(false); return; }
      await supabase.from('devis_items').delete().eq('devis_id', editing.id);
      const items = formItems.map((item, pos) => ({ devis_id: editing.id, designation: item.designation, quantite: item.quantite, prix_ht: item.prix_ht, tva_pct: item.tva_pct, position: pos }));
      await supabase.from('devis_items').insert(items);
      toast.success('Devis mis à jour');
    } else {
      const reference = await nextRef('DEV', 'devis');
      const { data, error } = await supabase.from('devis').insert({ ...payload, reference, statut: 'brouillon' }).select().single();
      if (error || !data) { toast.error(`Erreur : ${error?.message ?? 'Création échouée'}`); setSaving(false); return; }
      const items = formItems.map((item, pos) => ({ devis_id: data.id, designation: item.designation, quantite: item.quantite, prix_ht: item.prix_ht, tva_pct: item.tva_pct, position: pos }));
      await supabase.from('devis_items').insert(items);
      toast.success(`Devis ${reference} créé`);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function handleDelete(d: Devis) {
    if (!confirm(`Supprimer le devis ${d.reference} ?`)) return;
    const { error } = await supabase.from('devis').delete().eq('id', d.id);
    if (error) { toast.error(`Erreur : ${error.message}`); return; }
    toast.success(`Devis ${d.reference} supprimé`);
    load();
  }

  async function handleStatut(d: Devis, newStatut: string) {
    const { error } = await supabase.from('devis').update({ statut: newStatut, updated_at: new Date().toISOString() }).eq('id', d.id);
    if (error) { toast.error(`Erreur : ${error.message}`); return; }
    const label = newStatut === 'envoye' ? 'envoyé' : newStatut === 'accepte' ? 'accepté' : newStatut === 'refuse' ? 'refusé' : newStatut;
    toast.success(`Devis ${d.reference} ${label}`);
    load();
  }

  function openPDF(d: Devis) {
    const client = clients.find(c => c.id === d.client_id);
    setPdfDoc({
      type: 'devis',
      reference: d.reference,
      date_emission: d.date_emission,
      date_validite: d.date_validite,
      client: { nom: d.clients?.nom ?? client?.nom ?? '—', ice: d.clients?.ice ?? null, adresse: d.clients?.adresse_livraison ?? null, code: d.clients?.code ?? null },
      items: (d.devis_items ?? []).map(i => ({ designation: i.designation, quantite: i.quantite, prix_ht: i.prix_ht, tva_pct: i.tva_pct })),
      notes: d.notes,
      conditions: d.conditions,
      company: {
        raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege, code_postal: settings.code_postal,
        ville_siege: settings.ville_siege, telephone_societe: settings.telephone_societe, email_societe: settings.email_societe,
        site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal, ice_societe: settings.ice_societe, tp: settings.tp, cnss: settings.cnss,
      },
      logoUrl: settings.logo_url,
    });
  }

  const filtered = devis.filter(d => {
    const matchSearch = search === '' || d.reference.toLowerCase().includes(search.toLowerCase()) || (d.clients?.nom ?? '').toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filterStatut === 'all' || d.statut === filterStatut);
  });

  function getStatut(s: string) { return STATUTS.find(x => x.value === s) ?? STATUTS[0]; }

  const formTotals = calcTotals(formItems);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Barre d'actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[{ value: 'all', label: 'Tous' }, ...STATUTS].map(s => (
              <button key={s.value} onClick={() => setFilterStatut(s.value)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${filterStatut === s.value ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
          <Plus size={16} /> Nouveau devis
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <FileText size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucun devis trouvé</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => {
            const st = getStatut(d.statut);
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{d.reference}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color} ${st.bg}`}>{st.label}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {d.clients?.nom ?? '—'} · {formatDate(d.date_emission)}
                    {d.date_validite && <span className="ml-2 text-xs text-orange-500 font-medium">· valable jusqu'au {formatDate(d.date_validite)}</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-gray-900">{formatPrice(d.total_ttc)}</p>
                  <p className="text-xs text-gray-400">HT : {formatPrice(d.total_ht)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openPDF(d)} title="Aperçu PDF" className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-700"><Printer size={15} /></button>
                  <button onClick={() => openEdit(d)} title="Modifier" className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-700"><Pencil size={15} /></button>
                  {d.statut === 'brouillon' && (
                    <button onClick={() => handleStatut(d, 'envoye')} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-semibold flex items-center gap-1">
                      <ChevronRight size={12} /> Envoyer
                    </button>
                  )}
                  {d.statut === 'envoye' && (
                    <>
                      <button onClick={() => handleStatut(d, 'accepte')} className="px-2.5 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl text-xs font-semibold flex items-center gap-1">
                        <Check size={12} /> Accepter
                      </button>
                      <button onClick={() => handleStatut(d, 'refuse')} className="px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-semibold flex items-center gap-1">
                        <X size={12} /> Refuser
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(d)} className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pdfDoc && <FactureModal doc={pdfDoc} onClose={() => setPdfDoc(null)} />}

      {/* ── Formulaire Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">{editing ? 'Modifier le devis' : 'Nouveau devis'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* ── Client ── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                  <button type="button" onClick={() => setQuickClient(v => !v)}
                    className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${quickClient ? 'bg-blue-100 text-blue-700' : 'text-blue-600 hover:bg-blue-50'}`}>
                    <UserPlus size={12} />
                    {quickClient ? 'Annuler' : 'Nouveau client'}
                  </button>
                </div>
                {quickClient && (
                  <div className="mb-3 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Créer un client</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-3">
                        <input autoFocus value={qcNom} onChange={e => setQcNom(e.target.value)} placeholder="Nom du client *"
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      </div>
                      <div>
                        <input value={qcTel} onChange={e => setQcTel(e.target.value)} placeholder="Téléphone"
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      </div>
                      <div className="col-span-2">
                        <input value={qcEmail} onChange={e => setQcEmail(e.target.value)} placeholder="Email"
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setQuickClient(false)}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Annuler</button>
                      <button type="button" onClick={saveQuickClient} disabled={!qcNom.trim() || qcSaving}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1">
                        {qcSaving ? 'Création…' : <><Check size={11} /> Créer et sélectionner</>}
                      </button>
                    </div>
                  </div>
                )}
                <select value={formClientId} onChange={e => setFormClientId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>

              {/* ── Date émission + Validité ── */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date d&apos;émission</label>
                  <input type="date" value={formDateEmission}
                    onChange={e => setFormDateEmission(e.target.value)}
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <ValiditeSelector
                    emissionDate={formDateEmission}
                    value={formDateValidite}
                    onChange={setFormDateValidite}
                  />
                </div>
              </div>

              {/* ── Lignes ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Lignes <span className="text-[10px] text-purple-400 font-normal normal-case">(icône <BookOpen size={10} className="inline" /> pour choisir depuis le catalogue)</span>
                </label>
                <div className="mt-2 border border-gray-200 rounded-xl overflow-visible">
                  {/* En-tête colonnes */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-gray-50 rounded-t-xl text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <div className="col-span-5">Désignation</div>
                    <div className="col-span-2 text-center">Qté</div>
                    <div className="col-span-2 text-right">P.U. HT</div>
                    <div className="col-span-1 text-center">TVA</div>
                    <div className="col-span-1 text-right">Total HT</div>
                    <div className="col-span-1" />
                  </div>
                  {formItems.map((item, idx) => (
                    <div key={idx} className="relative">
                      <ItemRow item={item} idx={idx} catalog={catalog} onChange={updateItem}
                        onRemove={i => setFormItems(prev => prev.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                </div>
                <button onClick={() => setFormItems(prev => [...prev, { ...EMPTY_ITEM }])}
                  className="mt-2.5 text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 px-1">
                  <Plus size={12} /> Ajouter une ligne
                </button>
              </div>

              {/* ── Totaux ── */}
              <div className="flex justify-end">
                <div className="bg-gray-50 rounded-2xl p-4 w-64 space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Total HT</span>
                    <span className="font-bold text-gray-900">{formatPrice(formTotals.total_ht)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Total TVA</span>
                    <span className="font-bold text-gray-900">{formatPrice(formTotals.total_tva)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-gray-900 border-t border-gray-200 pt-2 mt-1">
                    <span>Total TTC</span>
                    <span className="text-blue-700">{formatPrice(formTotals.total_ttc)}</span>
                  </div>
                </div>
              </div>

              {/* ── Notes / Conditions ── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
                  <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3}
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conditions</label>
                  <textarea value={formConditions} onChange={e => setFormConditions(e.target.value)} rows={3}
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={handleSave} disabled={saving || !formClientId || formItems.some(i => !i.designation)}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le devis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
