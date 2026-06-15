'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Receipt, Printer, Pencil, Trash2, CreditCard, X, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Search, CheckSquare } from 'lucide-react';
import InvoiceDetailPanel from '@/components/facturation/InvoiceDetailPanel';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import FactureModal from '@/components/facturation/FactureModal';
import type { FactureDoc } from '@/components/facturation/FacturePDF';
import type { Client } from '@/types';
import { nextRef, calcTotals, createInvoiceFromBL, STATUTS_FACTURE, MODES_PAIEMENT as MODES_PAIEMENT_LIB } from '@/lib/facturation';
import { useToast } from '@/components/ui/Toast';

interface InvoiceItem {
  id?: string;
  designation: string;
  quantite: number;
  prix_ht: number;
  tva_pct: number;
}

interface Invoice {
  id: string;
  reference: string;
  statut: string;
  date_emission: string;
  date_echeance: string | null;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  total_regle: number;
  discount_percent: number;
  notes: string | null;
  mode_paiement: string | null;
  client_id: string | null;
  devis_id?: string | null;
  clients: { nom: string; ice: string | null; adresse_livraison: string | null; code: string | null } | null;
  invoice_items?: InvoiceItem[];
}

interface BonLivraison {
  id: string;
  numero: string;
  client_nom: string;
  delivery_date: string;
  items: { display_name: string; unit_price: number; quantity: number; vat_rate: number }[];
}

// Alias des constantes centralisées
const STATUTS = STATUTS_FACTURE;
const MODES_PAIEMENT = MODES_PAIEMENT_LIB;

const EMPTY_ITEM: InvoiceItem = { designation: '', quantite: 1, prix_ht: 0, tva_pct: 20 };

type SortField = 'reference' | 'client' | 'total_ttc' | 'statut' | 'date_emission';
type SortDir = 'asc' | 'desc';

function getStatut(s: string) {
  return STATUTS.find(x => x.value === s) ?? STATUTS[0];
}

// ─── Composant header de colonne triable ─────────────────────────────────────

function SortHeader({ label, field, sort, onSort }: {
  label: string; field: SortField;
  sort: { field: SortField; dir: SortDir };
  onSort: (f: SortField) => void;
}) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className="px-3 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 whitespace-nowrap"
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="text-gray-300">
          {active ? (sort.dir === 'asc' ? <ArrowUp size={12} className="text-blue-500" /> : <ArrowDown size={12} className="text-blue-500" />) : <ArrowUpDown size={12} />}
        </span>
      </div>
    </th>
  );
}

export default function FacturesSection() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState<'create' | 'edit' | 'payment' | 'bl' | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [pdfDoc, setPdfDoc] = useState<FactureDoc | null>(null);
  const { settings } = useAppSettings();
  const { toast } = useToast();

  // Tri
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'date_emission', dir: 'desc' });

  // Filtres inline
  const [fRef, setFRef] = useState('');
  const [fClient, setFClient] = useState('');
  const [fMontant, setFMontant] = useState('');
  const [fStatut, setFStatut] = useState('');
  const [fDateDu, setFDateDu] = useState('');
  const [fDateAu, setFDateAu] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(true);

  // Form facture
  const [formClientId, setFormClientId] = useState('');
  const [formDateEmission, setFormDateEmission] = useState(localDateStr());
  const [formDateEcheance, setFormDateEcheance] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formModePaiement, setFormModePaiement] = useState('');
  const [formDiscount, setFormDiscount] = useState(0);
  const [formItems, setFormItems] = useState<InvoiceItem[]>([{ ...EMPTY_ITEM }]);

  // Form paiement
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payDate, setPayDate] = useState(localDateStr());
  const [payMontant, setPayMontant] = useState(0);
  const [payMode, setPayMode] = useState('virement');
  const [payNotes, setPayNotes] = useState('');

  // BL import
  const [unbilledBLs, setUnbilledBLs] = useState<BonLivraison[]>([]);
  const [selectedBLs, setSelectedBLs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);

  const load = useCallback(async () => {
    const [invoicesRes, clientsRes] = await Promise.all([
      supabase.from('invoices')
        .select('*, clients(nom, ice, adresse_livraison, code), invoice_items(*)')
        .order('date_emission', { ascending: false }),
      supabase.from('clients').select('id, nom, ice, adresse_livraison, code').eq('is_active', true).order('nom'),
    ]);
    setInvoices(invoicesRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadUnbilledBLs() {
    const { data: billedIds } = await supabase.from('invoice_bons_livraison').select('bon_livraison_id');
    const billedSet = new Set((billedIds ?? []).map((r: any) => r.bon_livraison_id));
    const { data: bls } = await supabase.from('bons_livraison').select('*').order('delivery_date', { ascending: false });
    setUnbilledBLs((bls ?? []).filter((bl: any) => !billedSet.has(bl.id)));
  }

  function openCreate() {
    setEditing(null);
    const today = localDateStr();
    setFormClientId(''); setFormDateEmission(today);
    setFormDateEcheance(finDuMois(today));
    setFormNotes(''); setFormModePaiement(''); setFormDiscount(0); setFormItems([{ ...EMPTY_ITEM }]);
    setModalOpen('create');
  }

  function openEdit(inv: Invoice) {
    setEditing(inv);
    setFormClientId(inv.client_id ?? '');
    setFormDateEmission(inv.date_emission);
    setFormDateEcheance(inv.date_echeance ?? '');
    setFormNotes(inv.notes ?? '');
    setFormModePaiement(inv.mode_paiement ?? '');
    setFormDiscount(inv.discount_percent ?? 0);
    setFormItems(inv.invoice_items?.map(i => ({
      id: i.id, designation: i.designation, quantite: i.quantite, prix_ht: i.prix_ht, tva_pct: i.tva_pct,
    })) ?? [{ ...EMPTY_ITEM }]);
    setModalOpen('edit');
  }

  function openPayment(inv: Invoice) {
    setPayInvoice(inv);
    setPayDate(localDateStr());
    setPayMontant(Math.max(0, inv.total_ttc - inv.total_regle));
    setPayMode('virement'); setPayNotes('');
    setModalOpen('payment');
  }

  async function openBL() {
    await loadUnbilledBLs();
    setSelectedBLs([]);
    setModalOpen('bl');
  }

  async function handleSaveInvoice() {
    if (!formClientId || formItems.some(i => !i.designation)) return;
    setSaving(true);
    const totals = calcTotals(formItems, formDiscount);
    const payload = {
      client_id: formClientId, date_emission: formDateEmission,
      date_echeance: formDateEcheance || null, notes: formNotes || null,
      mode_paiement: formModePaiement || null,
      discount_percent: formDiscount, ...totals,
    };

    if (editing) {
      const { error } = await supabase.from('invoices').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast.error(`Erreur : ${error.message}`); setSaving(false); return; }
      await supabase.from('invoice_items').delete().eq('invoice_id', editing.id);
      await supabase.from('invoice_items').insert(formItems.map((i, pos) => ({ invoice_id: editing.id, ...i, position: pos, id: undefined })));
      toast.success('Facture mise à jour');
    } else {
      const reference = await nextRef('FA', 'invoices');
      const { data, error } = await supabase.from('invoices').insert({ ...payload, reference, statut: 'brouillon' }).select().single();
      if (error || !data) { toast.error(`Erreur : ${error?.message ?? 'Création échouée'}`); setSaving(false); return; }
      await supabase.from('invoice_items').insert(formItems.map((i, pos) => ({ invoice_id: data.id, ...i, position: pos })));
      toast.success(`Facture ${reference} créée`);
    }
    setSaving(false); setModalOpen(null); load();
  }

  async function handleImportBL() {
    if (selectedBLs.length === 0 || !formClientId) return;
    setSaving(true);
    const bls = unbilledBLs.filter(b => selectedBLs.includes(b.id));
    let successes = 0;
    let failures = 0;
    for (const bl of bls) {
      const result = await createInvoiceFromBL(bl, formClientId, formatDate);
      if (result.ok) successes++;
      else { failures++; console.error(`Erreur BL ${bl.numero} :`, result.error); }
    }
    setSaving(false); setModalOpen(null); load();
    if (failures === 0) {
      toast.success(`${successes} facture${successes > 1 ? 's créées' : ' créée'} depuis les BL`);
    } else if (successes > 0) {
      toast.error(`${successes} réussie${successes > 1 ? 's' : ''}, ${failures} échouée${failures > 1 ? 's' : ''}`);
    } else {
      toast.error('Échec de la création des factures depuis les BL');
    }
  }

  async function handleSavePayment() {
    if (!payInvoice || payMontant <= 0) return;
    const resteARegler = payInvoice.total_ttc - payInvoice.total_regle;
    if (payMontant > resteARegler + 0.005) {
      toast.error('Montant supérieur au reste à régler');
      return;
    }
    setSaving(true);
    const reference = await nextRef('PAY', 'payments');
    const { data: pay, error } = await supabase.from('payments').insert({
      reference, client_id: payInvoice.client_id, date: payDate,
      montant: payMontant, mode: payMode, notes: payNotes || null,
    }).select().single();
    if (error || !pay) { toast.error(`Erreur : ${error?.message ?? 'Création échouée'}`); setSaving(false); return; }
    await supabase.from('payment_invoices').insert({ payment_id: pay.id, invoice_id: payInvoice.id, montant_applique: payMontant });
    const newTotalRegle = payInvoice.total_regle + payMontant;
    const newStatut = newTotalRegle >= payInvoice.total_ttc ? 'soldee' : 'partiellement_reglee';
    await supabase.from('invoices').update({ total_regle: newTotalRegle, statut: newStatut, updated_at: new Date().toISOString() }).eq('id', payInvoice.id);
    toast.success(`Règlement ${reference} enregistré`);
    setSaving(false); setModalOpen(null); load();
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Supprimer la facture ${inv.reference} ?`)) return;
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
    if (error) { toast.error(`Erreur : ${error.message}`); return; }
    toast.success(`Facture ${inv.reference} supprimée`);
    load();
  }

  async function handleEmettre(inv: Invoice) {
    const { error } = await supabase.from('invoices').update({ statut: 'emise', updated_at: new Date().toISOString() }).eq('id', inv.id);
    if (error) { toast.error(`Erreur : ${error.message}`); return; }
    toast.success(`Facture ${inv.reference} émise`);
    load();
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.id)));
    }
  }

  async function handleBulkDelete() {
    const brouillons = filtered.filter(i => selected.has(i.id) && i.statut === 'brouillon');
    if (brouillons.length === 0) return;
    if (!confirm(`Supprimer ${brouillons.length} facture${brouillons.length > 1 ? 's' : ''} (brouillons uniquement) ?`)) return;
    setBulkDeleting(true);
    await supabase.from('invoices').delete().in('id', brouillons.map(i => i.id));
    setSelected(new Set());
    setBulkDeleting(false);
    load();
  }

  async function handleBulkEmettre() {
    const brouillons = filtered.filter(i => selected.has(i.id) && i.statut === 'brouillon');
    if (brouillons.length === 0) return;
    await supabase.from('invoices').update({ statut: 'emise', updated_at: new Date().toISOString() }).in('id', brouillons.map(i => i.id));
    setSelected(new Set());
    load();
  }

  async function openPDF(inv: Invoice) {
    const co = {
      raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege,
      code_postal: settings.code_postal, ville_siege: settings.ville_siege,
      telephone_societe: settings.telephone_societe, email_societe: settings.email_societe,
      site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal,
      ice_societe: settings.ice_societe, tp: settings.tp, cnss: settings.cnss,
    };
    const [blRes, payRes] = await Promise.all([
      supabase.from('invoice_bons_livraison').select('bons_livraison(numero)').eq('invoice_id', inv.id),
      supabase.from('payment_invoices').select('montant_applique, payments(date, mode, reference)').eq('invoice_id', inv.id),
    ]);
    const blRefs = (blRes.data ?? []).map((r: any) => r.bons_livraison?.numero).filter(Boolean) as string[];
    const pays = (payRes.data ?? []).map((r: any) => ({
      date: r.payments?.date ?? '', montant: r.montant_applique,
      mode: r.payments?.mode ?? '', reference: r.payments?.reference ?? '',
    }));
    setPdfDoc({
      type: 'facture', reference: inv.reference, date_emission: inv.date_emission,
      date_echeance: inv.date_echeance,
      bl_references: blRefs.length > 0 ? blRefs : null,
      total_regle: inv.total_regle,
      payments: pays.length > 0 ? pays : undefined,
      client: { nom: inv.clients?.nom ?? '—', ice: inv.clients?.ice ?? null, adresse: inv.clients?.adresse_livraison ?? null, code: inv.clients?.code ?? null },
      items: (inv.invoice_items ?? []).map(i => ({ designation: i.designation, quantite: i.quantite, prix_ht: i.prix_ht, tva_pct: i.tva_pct })),
      discount_percent: inv.discount_percent, notes: inv.notes, company: co, logoUrl: settings.logo_url,
    });
  }

  function updateItem(idx: number, field: keyof InvoiceItem, value: string | number) {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  function handleSort(field: SortField) {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' }
    );
  }

  function clearFilters() {
    setFRef(''); setFClient(''); setFMontant(''); setFStatut(''); setFDateDu(''); setFDateAu('');
  }

  const hasFilters = fRef || fClient || fMontant || fStatut || fDateDu || fDateAu;

  const filtered = useMemo(() => {
    let list = [...invoices];

    if (fRef) list = list.filter(i => i.reference.toLowerCase().includes(fRef.toLowerCase()));
    if (fClient) list = list.filter(i => (i.clients?.nom ?? '').toLowerCase().includes(fClient.toLowerCase()));
    if (fMontant) list = list.filter(i => String(i.total_ttc).includes(fMontant));
    if (fStatut) list = list.filter(i => i.statut === fStatut);
    if (fDateDu) list = list.filter(i => i.date_emission >= fDateDu);
    if (fDateAu) list = list.filter(i => i.date_emission <= fDateAu);

    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sort.field === 'reference') { va = a.reference; vb = b.reference; }
      else if (sort.field === 'client') { va = a.clients?.nom ?? ''; vb = b.clients?.nom ?? ''; }
      else if (sort.field === 'total_ttc') { va = a.total_ttc; vb = b.total_ttc; }
      else if (sort.field === 'statut') { va = a.statut; vb = b.statut; }
      else if (sort.field === 'date_emission') { va = a.date_emission; vb = b.date_emission; }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [invoices, fRef, fClient, fMontant, fStatut, fDateDu, fDateAu, sort]);

  const formTotals = calcTotals(formItems, formDiscount);

  function finDuMois(base: string): string {
    const [y, m] = base.split('-').map(Number);
    return `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
  }

  const InvoiceForm = (
    <div className="space-y-4">
      {/* Ligne 1 : Client + Date émission */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
          <select value={formClientId} onChange={e => setFormClientId(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Sélectionner un client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date d&apos;émission</label>
          <input type="date" value={formDateEmission} onChange={e => {
            setFormDateEmission(e.target.value);
            if (!formDateEcheance || formDateEcheance === finDuMois(formDateEmission)) {
              setFormDateEcheance(finDuMois(e.target.value));
            }
          }}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Ligne 2 : Échéance + Mode de paiement */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Échéance</label>
          <div className="mt-1 flex gap-2">
            <button type="button"
              onClick={() => setFormDateEcheance(finDuMois(formDateEmission))}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${formDateEcheance === finDuMois(formDateEmission) ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              Fin du mois
            </button>
            <input type="date" value={formDateEcheance} onChange={e => setFormDateEcheance(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode de paiement</label>
          <select value={formModePaiement} onChange={e => setFormModePaiement(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">…</option>
            <option value="virement">Virement</option>
            <option value="especes">Espèces</option>
            <option value="cheque">Chèque</option>
            <option value="carte">Carte</option>
          </select>
        </div>
      </div>

      {/* Ligne 3 : Remise */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Remise %</label>
          <input type="number" min="0" max="100" step="0.01" value={formDiscount} onChange={e => setFormDiscount(parseFloat(e.target.value) || 0)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lignes</label>
        <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
            <div className="col-span-5">Désignation</div>
            <div className="col-span-2 text-center">Qté</div>
            <div className="col-span-2 text-right">P.U. HT</div>
            <div className="col-span-1 text-center">TVA%</div>
            <div className="col-span-1 text-right">Total HT</div>
            <div className="col-span-1" />
          </div>
          {formItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-gray-100 items-center">
              <div className="col-span-5">
                <input value={item.designation} onChange={e => updateItem(idx, 'designation', e.target.value)}
                  placeholder="Désignation"
                  className="w-full text-sm border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
              </div>
              <div className="col-span-2">
                <input type="number" min="0" step="0.001" value={item.quantite} onChange={e => updateItem(idx, 'quantite', parseFloat(e.target.value) || 0)}
                  className="w-full text-sm text-center border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
              </div>
              <div className="col-span-2">
                <input type="number" min="0" step="0.01" value={item.prix_ht} onChange={e => updateItem(idx, 'prix_ht', parseFloat(e.target.value) || 0)}
                  className="w-full text-sm text-right border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
              </div>
              <div className="col-span-1">
                <select value={item.tva_pct} onChange={e => updateItem(idx, 'tva_pct', parseFloat(e.target.value))}
                  className="w-full text-xs text-center border-0 focus:outline-none">
                  <option value={0}>0%</option>
                  <option value={10}>10%</option>
                  <option value={20}>20%</option>
                </select>
              </div>
              <div className="col-span-1 text-right text-xs text-gray-600 font-medium">
                {(item.quantite * item.prix_ht).toFixed(2)}
              </div>
              <div className="col-span-1 flex justify-end">
                <button onClick={() => setFormItems(prev => prev.filter((_, i) => i !== idx))}
                  className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-400">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setFormItems(prev => [...prev, { ...EMPTY_ITEM }])}
          className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
          <Plus size={12} /> Ajouter une ligne
        </button>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
          <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2}
            className="mt-1 w-72 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
        <div className="text-right space-y-1">
          <p className="text-sm text-gray-500">Total HT : <span className="font-bold text-gray-900">{formatPrice(formTotals.total_ht)}</span></p>
          <p className="text-sm text-gray-500">Total TVA : <span className="font-bold text-gray-900">{formatPrice(formTotals.total_tva)}</span></p>
          <p className="text-base text-gray-900 font-black">Total TTC : {formatPrice(formTotals.total_ttc)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Barre d'outils */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-gray-400 text-sm">{filtered.length} / {invoices.length} facture{invoices.length !== 1 ? 's' : ''}</p>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5">
              <span className="text-xs font-semibold text-blue-700">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
              <div className="w-px h-4 bg-blue-200" />
              <button onClick={handleBulkEmettre}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                Émettre
              </button>
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors disabled:opacity-50">
                {bulkDeleting ? 'Suppression…' : 'Supprimer'}
              </button>
              <button onClick={() => setSelected(new Set())} className="text-blue-400 hover:text-blue-600">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={openBL}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
            <ChevronDown size={15} />
            Depuis BL
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
            <Plus size={16} />
            Nouvelle facture
          </button>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {/* Ligne d'en-têtes triables */}
                <tr className="border-b border-gray-100">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </th>
                  <SortHeader label="Référence" field="reference" sort={sort} onSort={handleSort} />
                  <SortHeader label="Client" field="client" sort={sort} onSort={handleSort} />
                  <SortHeader label="Montant TTC" field="total_ttc" sort={sort} onSort={handleSort} />
                  <SortHeader label="Statut" field="statut" sort={sort} onSort={handleSort} />
                  <SortHeader label="Date d'émission" field="date_emission" sort={sort} onSort={handleSort} />
                  <th className="px-3 py-3 text-right">
                    <button
                      onClick={() => setFiltersVisible(v => !v)}
                      title={filtersVisible ? 'Masquer les filtres' : 'Afficher les filtres'}
                      className={`p-1.5 rounded-lg transition-colors ${filtersVisible ? 'bg-blue-50 text-blue-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'}`}>
                      <Search size={14} />
                    </button>
                  </th>
                </tr>

                {/* Ligne de filtres */}
                {filtersVisible && (
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <td className="pl-4 pr-2 py-2" />
                    <td className="px-3 py-2">
                      <input value={fRef} onChange={e => setFRef(e.target.value)} placeholder="…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={fClient} onChange={e => setFClient(e.target.value)} placeholder="…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={fMontant} onChange={e => setFMontant(e.target.value)} placeholder="…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={fStatut} onChange={e => setFStatut(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">…</option>
                        {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <input type="date" value={fDateDu} onChange={e => setFDateDu(e.target.value)}
                          placeholder="Du"
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                        <input type="date" value={fDateAu} onChange={e => setFDateAu(e.target.value)}
                          placeholder="Au"
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {hasFilters && (
                        <button onClick={clearFilters}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <Receipt size={32} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">Aucune facture</p>
                    </td>
                  </tr>
                ) : filtered.map(inv => {
                  const st = getStatut(inv.statut);
                  const resteARegler = Math.max(0, inv.total_ttc - inv.total_regle);
                  return (
                    <tr key={inv.id}
                      onClick={() => setDetailInvoice(inv)}
                      className={`hover:bg-gray-50/50 transition-colors group cursor-pointer ${selected.has(inv.id) ? 'bg-blue-50/40' : ''}`}>
                      <td className="pl-4 pr-2 py-3 w-8" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-semibold text-gray-900 text-sm">{inv.reference}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">
                        {inv.clients?.nom ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div>
                          <span className="font-black text-gray-900 text-sm">{formatPrice(inv.total_ttc)}</span>
                          {inv.statut === 'partiellement_reglee' && (
                            <div className="text-xs text-orange-500">Reste : {formatPrice(resteARegler)}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color} ${st.bg}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-500">
                        {formatDate(inv.date_emission)}
                        {inv.date_echeance && <div className="text-xs text-gray-400">Éch. {formatDate(inv.date_echeance)}</div>}
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openPDF(inv)} title="Aperçu PDF"
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                            <Printer size={14} />
                          </button>
                          {inv.statut === 'brouillon' && (
                            <>
                              <button onClick={() => openEdit(inv)} title="Modifier"
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleEmettre(inv)}
                                className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold">
                                Émettre
                              </button>
                              <button onClick={() => handleDelete(inv)} title="Supprimer"
                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          {['emise', 'partiellement_reglee'].includes(inv.statut) && (
                            <button onClick={() => openPayment(inv)}
                              className="px-2 py-1 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg text-xs font-semibold flex items-center gap-1">
                              <CreditCard size={11} /> Règlement
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pdfDoc && <FactureModal doc={pdfDoc} onClose={() => setPdfDoc(null)} />}

      {detailInvoice && (
        <InvoiceDetailPanel
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onEdit={inv => { setDetailInvoice(null); openEdit(inv); }}
          onPayment={inv => { setDetailInvoice(null); openPayment(inv); }}
          onEmettre={async inv => { await handleEmettre(inv); setDetailInvoice(null); }}
          onRefresh={load}
        />
      )}

      {/* Modal création / édition */}
      {(modalOpen === 'create' || modalOpen === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing ? 'Modifier la facture' : 'Nouvelle facture'}</h2>
              <button onClick={() => setModalOpen(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">{InvoiceForm}</div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSaveInvoice} disabled={saving || !formClientId}
                className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal depuis BL */}
      {modalOpen === 'bl' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Créer depuis des BL</h2>
              <button onClick={() => setModalOpen(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                <select value={formClientId} onChange={e => setFormClientId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              {(() => {
                const selectedClientNom = clients.find(c => c.id === formClientId)?.nom ?? '';
                const visibleBLs = formClientId
                  ? unbilledBLs.filter(bl => bl.client_nom.toLowerCase() === selectedClientNom.toLowerCase())
                  : unbilledBLs;
                return visibleBLs.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">
                    {formClientId ? 'Aucun BL non facturé pour ce client' : 'Aucun BL non facturé'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {visibleBLs.map(bl => (
                      <label key={bl.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selectedBLs.includes(bl.id)}
                          onChange={e => setSelectedBLs(prev => e.target.checked ? [...prev, bl.id] : prev.filter(id => id !== bl.id))}
                          className="w-4 h-4 rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{bl.numero}</p>
                          <p className="text-xs text-gray-400">{bl.client_nom} · {formatDate(bl.delivery_date)}</p>
                        </div>
                        <span className="text-xs text-gray-400">{bl.items?.length ?? 0} articles</span>
                      </label>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleImportBL} disabled={saving || selectedBLs.length === 0 || !formClientId}
                className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Création…' : `Créer la facture (${selectedBLs.length} BL)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal règlement */}
      {modalOpen === 'payment' && payInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Enregistrer un règlement</h2>
                <p className="text-sm text-gray-400">{payInvoice.reference} · {payInvoice.clients?.nom}</p>
              </div>
              <button onClick={() => setModalOpen(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 flex justify-between text-sm">
                <span className="text-gray-500">Reste à régler</span>
                <span className="font-black text-gray-900">{formatPrice(Math.max(0, payInvoice.total_ttc - payInvoice.total_regle))}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Montant</label>
                  <input type="number" min="0" step="0.01" value={payMontant} onChange={e => setPayMontant(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode de paiement</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {MODES_PAIEMENT.map(m => (
                    <button key={m.value} onClick={() => setPayMode(m.value)}
                      className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${payMode === m.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
                <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Réf. virement, chèque n°…"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSavePayment} disabled={saving || payMontant <= 0}
                className="px-5 py-2 bg-green-700 text-white rounded-xl text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : 'Enregistrer le règlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
