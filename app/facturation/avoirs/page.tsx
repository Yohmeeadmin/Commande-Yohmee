'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, RotateCcw, Printer, Trash2, X, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import FactureModal from '@/components/facturation/FactureModal';
import type { FactureDoc } from '@/components/facturation/FacturePDF';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreditNote {
  id: string;
  reference: string;
  date: string;
  montant: number;
  motif: string | null;
  statut: string;
  client_id: string | null;
  invoice_id: string | null;
  clients: { nom: string; ice: string | null; adresse_livraison: string | null; code: string | null } | null;
  invoices: { reference: string; invoice_items?: { designation: string; quantite: number; prix_ht: number; tva_pct: number }[] } | null;
}

interface Invoice {
  id: string;
  reference: string;
  client_id: string | null;
  total_ttc: number;
  clients: { nom: string } | null;
  invoice_items?: { designation: string; quantite: number; prix_ht: number; tva_pct: number }[];
}

async function nextReference(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data } = await supabase
    .from('credit_notes').select('reference').like('reference', `AV-${ym}-%`)
    .order('reference', { ascending: false }).limit(1);
  const last = data?.[0]?.reference;
  const num = last ? parseInt(last.split('-').pop() ?? '0') + 1 : 1;
  return `AV-${ym}-${String(num).padStart(4, '0')}`;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function AvoirsPage() {
  const [avoirs, setAvoirs] = useState<CreditNote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<FactureDoc | null>(null);
  const { settings } = useAppSettings();

  // Form
  const [formInvoiceId, setFormInvoiceId] = useState('');
  const [formDate, setFormDate] = useState(localDateStr());
  const [formMontant, setFormMontant] = useState('');
  const [formMotif, setFormMotif] = useState('');

  const load = useCallback(async () => {
    const [avoirsRes, invoicesRes] = await Promise.all([
      supabase.from('credit_notes')
        .select('*, clients(nom, ice, adresse_livraison, code), invoices(reference, invoice_items(designation, quantite, prix_ht, tva_pct))')
        .order('date', { ascending: false }),
      supabase.from('invoices')
        .select('id, reference, client_id, total_ttc, clients(nom), invoice_items(designation, quantite, prix_ht, tva_pct)')
        .in('statut', ['emise', 'partiellement_reglee', 'soldee'])
        .order('date_emission', { ascending: false }),
    ]);
    setAvoirs(avoirsRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setFormInvoiceId(''); setFormDate(localDateStr());
    setFormMontant(''); setFormMotif('');
    setModalOpen(true);
  }

  const selectedInvoice = invoices.find(i => i.id === formInvoiceId) ?? null;

  async function handleSave() {
    const montant = parseFloat(formMontant);
    if (!selectedInvoice || isNaN(montant) || montant <= 0) return;
    setSaving(true);

    const reference = await nextReference();
    await supabase.from('credit_notes').insert({
      reference,
      invoice_id: formInvoiceId,
      client_id: selectedInvoice.client_id,
      date: formDate,
      montant,
      motif: formMotif || null,
      statut: 'emis',
    });

    setSaving(false); setModalOpen(false); load();
  }

  async function handleDelete(av: CreditNote) {
    if (!confirm(`Supprimer l'avoir ${av.reference} ?`)) return;
    await supabase.from('credit_notes').delete().eq('id', av.id);
    load();
  }

  async function handleUtiliser(av: CreditNote) {
    await supabase.from('credit_notes').update({ statut: 'utilise' }).eq('id', av.id);
    load();
  }

  function openPDF(av: CreditNote) {
    const co = {
      raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege,
      code_postal: settings.code_postal, ville_siege: settings.ville_siege,
      telephone_societe: settings.telephone_societe, email_societe: settings.email_societe,
      site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal,
      ice_societe: settings.ice_societe, tp: settings.tp, cnss: settings.cnss,
    };

    const items = av.invoices?.invoice_items ?? [];
    // On crée un avoir avec un seul item "Avoir" si pas d'items de facture
    const pdfItems = items.length > 0
      ? items.map(i => ({ designation: i.designation, quantite: i.quantite, prix_ht: i.prix_ht, tva_pct: i.tva_pct }))
      : [{ designation: av.motif || 'Avoir', quantite: 1, prix_ht: av.montant, tva_pct: 0 }];

    setPdfDoc({
      type: 'avoir',
      reference: av.reference,
      date_emission: av.date,
      invoice_reference: av.invoices?.reference ?? null,
      client: {
        nom: av.clients?.nom ?? '—',
        ice: av.clients?.ice ?? null,
        adresse: av.clients?.adresse_livraison ?? null,
        code: av.clients?.code ?? null,
      },
      items: pdfItems,
      notes: av.motif,
      company: co,
      logoUrl: settings.logo_url,
    });
  }

  const filtered = avoirs.filter(av =>
    search === '' ||
    av.reference.toLowerCase().includes(search.toLowerCase()) ||
    (av.clients?.nom ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Avoirs</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {avoirs.filter(a => a.statut === 'emis').length} disponibles · {avoirs.length} total
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
          <Plus size={16} />
          Nouvel avoir
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
          className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <RotateCcw size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucun avoir trouvé</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(av => (
            <div key={av.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900">{av.reference}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${av.statut === 'emis' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                    {av.statut === 'emis' ? 'Disponible' : 'Utilisé'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {av.clients?.nom ?? '—'} · {formatDate(av.date)}
                  {av.invoices?.reference && ` · Facture ${av.invoices.reference}`}
                </p>
                {av.motif && <p className="text-xs text-gray-400 mt-0.5">{av.motif}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-orange-600">{formatPrice(av.montant)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openPDF(av)} title="Aperçu PDF"
                  className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-700">
                  <Printer size={15} />
                </button>
                {av.statut === 'emis' && (
                  <button onClick={() => handleUtiliser(av)} title="Marquer comme utilisé"
                    className="p-2 hover:bg-green-50 rounded-xl text-gray-400 hover:text-green-600">
                    <CheckCircle size={15} />
                  </button>
                )}
                <button onClick={() => handleDelete(av)} title="Supprimer"
                  className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PDF Modal */}
      {pdfDoc && <FactureModal doc={pdfDoc} onClose={() => setPdfDoc(null)} />}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Nouvel avoir</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Facture source */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Facture source *</label>
                <select value={formInvoiceId} onChange={e => {
                  setFormInvoiceId(e.target.value);
                  const inv = invoices.find(i => i.id === e.target.value);
                  if (inv) setFormMontant(String(inv.total_ttc));
                }}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Sélectionner une facture —</option>
                  {invoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.reference} — {(inv.clients as any)?.nom} — {formatPrice(inv.total_ttc)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedInvoice && (
                <div className="bg-blue-50 rounded-xl p-3 text-sm">
                  <span className="text-blue-700 font-semibold">{(selectedInvoice.clients as any)?.nom}</span>
                  <span className="text-blue-500"> · Total : {formatPrice(selectedInvoice.total_ttc)}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Montant (MAD) *</label>
                  <input type="number" min="0" step="0.01" value={formMontant} onChange={e => setFormMontant(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Motif</label>
                <textarea value={formMotif} onChange={e => setFormMotif(e.target.value)} rows={3}
                  placeholder="Retour marchandise, erreur de facturation…"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving || !formInvoiceId || !formMontant || parseFloat(formMontant) <= 0}
                className="px-5 py-2 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                {saving ? 'Création…' : 'Créer l\'avoir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
