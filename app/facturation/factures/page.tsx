'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Receipt, Printer, Pencil, Trash2, CreditCard, X, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import FactureModal from '@/components/facturation/FactureModal';
import type { FactureDoc } from '@/components/facturation/FacturePDF';
import type { Client } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  client_id: string | null;
  devis_id: string | null;
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

const STATUTS = [
  { value: 'brouillon', label: 'Brouillon', color: 'text-gray-600', bg: 'bg-gray-100' },
  { value: 'emise', label: 'Émise', color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'partiellement_reglee', label: 'Partiel', color: 'text-orange-500', bg: 'bg-orange-100' },
  { value: 'soldee', label: 'Soldée', color: 'text-green-600', bg: 'bg-green-100' },
  { value: 'annulee', label: 'Annulée', color: 'text-red-600', bg: 'bg-red-100' },
];

const MODES_PAIEMENT = [
  { value: 'virement', label: 'Virement' },
  { value: 'especes', label: 'Espèces' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'carte', label: 'Carte' },
  { value: 'avoir', label: 'Avoir' },
];

const EMPTY_ITEM: InvoiceItem = { designation: '', quantite: 1, prix_ht: 0, tva_pct: 20 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function nextReference(prefix: string, table: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data } = await supabase
    .from(table).select('reference').like('reference', `${prefix}-${ym}-%`)
    .order('reference', { ascending: false }).limit(1);
  const last = data?.[0]?.reference;
  const num = last ? parseInt(last.split('-').pop() ?? '0') + 1 : 1;
  return `${prefix}-${ym}-${String(num).padStart(4, '0')}`;
}

function calcTotals(items: InvoiceItem[], discount = 0) {
  const total_ht_brut = items.reduce((s, i) => s + i.quantite * i.prix_ht, 0);
  const discountAmount = total_ht_brut * (discount / 100);
  const total_ht = total_ht_brut - discountAmount;
  const total_tva = items.reduce((s, i) => s + i.quantite * i.prix_ht * (1 - discount / 100) * (i.tva_pct / 100), 0);
  return { total_ht, total_tva, total_ttc: total_ht + total_tva };
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function FacturesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState<'create' | 'edit' | 'payment' | 'bl' | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [pdfDoc, setPdfDoc] = useState<FactureDoc | null>(null);
  const { settings } = useAppSettings();

  // Form state — facture
  const [formClientId, setFormClientId] = useState('');
  const [formDateEmission, setFormDateEmission] = useState(localDateStr());
  const [formDateEcheance, setFormDateEcheance] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formDiscount, setFormDiscount] = useState(0);
  const [formItems, setFormItems] = useState<InvoiceItem[]>([{ ...EMPTY_ITEM }]);

  // Form state — paiement
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payDate, setPayDate] = useState(localDateStr());
  const [payMontant, setPayMontant] = useState(0);
  const [payMode, setPayMode] = useState('virement');
  const [payNotes, setPayNotes] = useState('');

  // BL import
  const [unbilledBLs, setUnbilledBLs] = useState<BonLivraison[]>([]);
  const [selectedBLs, setSelectedBLs] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

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
    setFormClientId(''); setFormDateEmission(localDateStr()); setFormDateEcheance('');
    setFormNotes(''); setFormDiscount(0); setFormItems([{ ...EMPTY_ITEM }]);
    setModalOpen('create');
  }

  function openEdit(inv: Invoice) {
    setEditing(inv);
    setFormClientId(inv.client_id ?? '');
    setFormDateEmission(inv.date_emission);
    setFormDateEcheance(inv.date_echeance ?? '');
    setFormNotes(inv.notes ?? '');
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
      discount_percent: formDiscount, ...totals,
    };

    if (editing) {
      await supabase.from('invoices').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      await supabase.from('invoice_items').delete().eq('invoice_id', editing.id);
      await supabase.from('invoice_items').insert(formItems.map((i, pos) => ({ invoice_id: editing.id, ...i, position: pos, id: undefined })));
    } else {
      const reference = await nextReference('FA', 'invoices');
      const { data } = await supabase.from('invoices').insert({ ...payload, reference, statut: 'brouillon' }).select().single();
      if (data) {
        await supabase.from('invoice_items').insert(formItems.map((i, pos) => ({ invoice_id: data.id, ...i, position: pos })));
      }
    }
    setSaving(false); setModalOpen(null); load();
  }

  async function handleImportBL() {
    if (selectedBLs.length === 0 || !formClientId) return;
    setSaving(true);

    const bls = unbilledBLs.filter(b => selectedBLs.includes(b.id));
    const allItems: InvoiceItem[] = bls.flatMap(bl =>
      (bl.items ?? []).map(it => ({
        designation: `${it.display_name} — BL ${bl.numero} du ${formatDate(bl.delivery_date)}`,
        quantite: it.quantity,
        prix_ht: it.unit_price,
        tva_pct: it.vat_rate,
      }))
    );

    const totals = calcTotals(allItems);
    const reference = await nextReference('FA', 'invoices');
    const { data: inv } = await supabase.from('invoices').insert({
      reference, client_id: formClientId, statut: 'brouillon',
      date_emission: localDateStr(), ...totals,
    }).select().single();

    if (inv) {
      await supabase.from('invoice_items').insert(allItems.map((i, pos) => ({ invoice_id: inv.id, ...i, position: pos })));
      await supabase.from('invoice_bons_livraison').insert(selectedBLs.map(id => ({ invoice_id: inv.id, bon_livraison_id: id })));
    }
    setSaving(false); setModalOpen(null); load();
  }

  async function handleSavePayment() {
    if (!payInvoice || payMontant <= 0) return;
    setSaving(true);

    const reference = await nextReference('PAY', 'payments');
    const { data: pay } = await supabase.from('payments').insert({
      reference, client_id: payInvoice.client_id, date: payDate,
      montant: payMontant, mode: payMode, notes: payNotes || null,
    }).select().single();

    if (pay) {
      await supabase.from('payment_invoices').insert({ payment_id: pay.id, invoice_id: payInvoice.id, montant_applique: payMontant });
      const newTotalRegle = payInvoice.total_regle + payMontant;
      const newStatut = newTotalRegle >= payInvoice.total_ttc ? 'soldee' : 'partiellement_reglee';
      await supabase.from('invoices').update({ total_regle: newTotalRegle, statut: newStatut, updated_at: new Date().toISOString() }).eq('id', payInvoice.id);
    }
    setSaving(false); setModalOpen(null); load();
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Supprimer la facture ${inv.reference} ?`)) return;
    await supabase.from('invoices').delete().eq('id', inv.id);
    load();
  }

  async function handleEmettre(inv: Invoice) {
    await supabase.from('invoices').update({ statut: 'emise', updated_at: new Date().toISOString() }).eq('id', inv.id);
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

    // Charge les BL liés et les règlements en parallèle
    const [blRes, payRes] = await Promise.all([
      supabase.from('invoice_bons_livraison')
        .select('bons_livraison(numero)')
        .eq('invoice_id', inv.id),
      supabase.from('payment_invoices')
        .select('montant_applique, payments(date, mode, reference)')
        .eq('invoice_id', inv.id),
    ]);

    const blRefs = (blRes.data ?? []).map((r: any) => r.bons_livraison?.numero).filter(Boolean) as string[];
    const pays = (payRes.data ?? []).map((r: any) => ({
      date: r.payments?.date ?? '',
      montant: r.montant_applique,
      mode: r.payments?.mode ?? '',
      reference: r.payments?.reference ?? '',
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

  const filtered = invoices.filter(inv => {
    const matchSearch = search === '' || inv.reference.toLowerCase().includes(search.toLowerCase()) || (inv.clients?.nom ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut === 'all' || inv.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  function getStatut(s: string) {
    return STATUTS.find(x => x.value === s) ?? STATUTS[0];
  }

  function updateItem(idx: number, field: keyof InvoiceItem, value: string | number) {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  const formTotals = calcTotals(formItems, formDiscount);

  // Form commun create/edit
  const InvoiceForm = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
          <select value={formClientId} onChange={e => setFormClientId(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Sélectionner un client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date d&apos;émission</label>
          <input type="date" value={formDateEmission} onChange={e => setFormDateEmission(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date d&apos;échéance</label>
          <input type="date" value={formDateEcheance} onChange={e => setFormDateEcheance(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Remise %</label>
          <input type="number" min="0" max="100" step="0.01" value={formDiscount} onChange={e => setFormDiscount(parseFloat(e.target.value) || 0)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Lignes */}
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
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none w-72" />
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
    <div className="p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Factures</h1>
          <p className="text-gray-400 text-sm mt-0.5">{invoices.length} factures</p>
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

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ value: 'all', label: 'Toutes' }, ...STATUTS].map(s => (
            <button key={s.value} onClick={() => setFilterStatut(s.value)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${filterStatut === s.value ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Receipt size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucune facture trouvée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => {
            const st = getStatut(inv.statut);
            const resteARegler = Math.max(0, inv.total_ttc - inv.total_regle);
            return (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{inv.reference}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color} ${st.bg}`}>{st.label}</span>
                    {inv.statut === 'partiellement_reglee' && (
                      <span className="text-[11px] text-orange-600">Reste : {formatPrice(resteARegler)}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {inv.clients?.nom ?? '—'} · {formatDate(inv.date_emission)}
                    {inv.date_echeance && ` · Éch. ${formatDate(inv.date_echeance)}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-gray-900">{formatPrice(inv.total_ttc)}</p>
                  <p className="text-xs text-gray-400">HT : {formatPrice(inv.total_ht)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openPDF(inv)} title="Aperçu PDF"
                    className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-700">
                    <Printer size={15} />
                  </button>
                  {inv.statut === 'brouillon' && (
                    <>
                      <button onClick={() => openEdit(inv)} title="Modifier"
                        className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-700">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleEmettre(inv)}
                        className="px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-semibold">
                        Émettre
                      </button>
                    </>
                  )}
                  {['emise', 'partiellement_reglee'].includes(inv.statut) && (
                    <button onClick={() => openPayment(inv)}
                      className="px-2.5 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl text-xs font-semibold flex items-center gap-1">
                      <CreditCard size={12} /> Règlement
                    </button>
                  )}
                  {inv.statut === 'brouillon' && (
                    <button onClick={() => handleDelete(inv)} title="Supprimer"
                      className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PDF Modal */}
      {pdfDoc && <FactureModal doc={pdfDoc} onClose={() => setPdfDoc(null)} />}

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
