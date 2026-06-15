'use client';

import { useEffect, useState } from 'react';
import { X, Printer, Pencil, CreditCard, Copy, CheckCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import { numberToWordsFr } from '@/components/livraisons/BonLivraison';
import FactureModal from '@/components/facturation/FactureModal';
import type { FactureDoc } from '@/components/facturation/FacturePDF';
import { STATUTS_FACTURE } from '@/lib/facturation';

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

// Convertit le tableau STATUTS_FACTURE en Record pour lookup rapide
const STATUTS: Record<string, { label: string; color: string; bg: string }> = Object.fromEntries(
  STATUTS_FACTURE.map(s => [s.value, { label: s.label, color: s.color, bg: s.bg }])
);

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onEdit: (inv: Invoice) => void;
  onPayment: (inv: Invoice) => void;
  onEmettre: (inv: Invoice) => void;
  onRefresh: () => void;
}

export default function InvoiceDetailPanel({ invoice: initialInvoice, onClose, onEdit, onPayment, onEmettre }: Props) {
  const [invoice, setInvoice] = useState<Invoice>(initialInvoice);
  const [pdfDoc, setPdfDoc] = useState<FactureDoc | null>(null);
  const [mounted, setMounted] = useState(false);
  const { settings } = useAppSettings();

  // Animation d'entrée
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Recharge les items si pas déjà présents
  useEffect(() => {
    if (!initialInvoice.invoice_items) {
      supabase.from('invoices')
        .select('*, clients(nom, ice, adresse_livraison, code), invoice_items(*)')
        .eq('id', initialInvoice.id)
        .single()
        .then(({ data }: { data: any }) => { if (data) setInvoice(data as Invoice); });
    } else {
      setInvoice(initialInvoice);
    }
  }, [initialInvoice]);

  async function handleOpenPDF() {
    const co = {
      raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege,
      code_postal: settings.code_postal, ville_siege: settings.ville_siege,
      telephone_societe: settings.telephone_societe, email_societe: settings.email_societe,
      site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal,
      ice_societe: settings.ice_societe, tp: settings.tp, cnss: settings.cnss,
    };
    const [blRes, payRes] = await Promise.all([
      supabase.from('invoice_bons_livraison').select('bons_livraison(numero)').eq('invoice_id', invoice.id),
      supabase.from('payment_invoices').select('montant_applique, payments(date, mode, reference)').eq('invoice_id', invoice.id),
    ]);
    const blRefs = (blRes.data ?? []).map((r: any) => r.bons_livraison?.numero).filter(Boolean) as string[];
    const pays = (payRes.data ?? []).map((r: any) => ({
      date: r.payments?.date ?? '', montant: r.montant_applique,
      mode: r.payments?.mode ?? '', reference: r.payments?.reference ?? '',
    }));
    setPdfDoc({
      type: 'facture', reference: invoice.reference, date_emission: invoice.date_emission,
      date_echeance: invoice.date_echeance,
      bl_references: blRefs.length > 0 ? blRefs : null,
      total_regle: invoice.total_regle,
      payments: pays.length > 0 ? pays : undefined,
      client: { nom: invoice.clients?.nom ?? '—', ice: invoice.clients?.ice ?? null, adresse: invoice.clients?.adresse_livraison ?? null, code: invoice.clients?.code ?? null },
      items: (invoice.invoice_items ?? []).map(i => ({ designation: i.designation, quantite: i.quantite, prix_ht: i.prix_ht, tva_pct: i.tva_pct })),
      discount_percent: invoice.discount_percent, notes: invoice.notes, company: co, logoUrl: settings.logo_url,
    });
  }

  const items = invoice.invoice_items ?? [];
  const st = STATUTS[invoice.statut] ?? STATUTS.brouillon;
  const discountAmount = items.reduce((s, i) => s + i.quantite * i.prix_ht, 0) * (invoice.discount_percent / 100);
  const resteARegler = Math.max(0, invoice.total_ttc - invoice.total_regle);

  const InfoCard = ({ label, value, icon }: { label: string; value: string; icon: string }) => (
    <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3">
      <div className="text-2xl shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="font-bold text-gray-900 text-sm mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full z-50 w-full max-w-2xl bg-gray-50 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${mounted ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header client */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              {/* Avatar initiales */}
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-black text-lg">
                  {(invoice.clients?.nom ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-gray-900 text-lg truncate">{invoice.clients?.nom ?? '—'}</h2>
                  {invoice.clients?.code && (
                    <span className="text-xs text-gray-400 font-mono">Réf. {invoice.clients.code}</span>
                  )}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color} ${st.bg}`}>
                    {st.label}
                  </span>
                </div>
                {invoice.clients?.ice && (
                  <p className="text-sm text-gray-400 mt-0.5">I.C.E : {invoice.clients.ice}</p>
                )}
                {invoice.clients?.adresse_livraison && (
                  <p className="text-xs text-gray-400 mt-0.5">📍 {invoice.clients.adresse_livraison}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Actions */}
              <button onClick={handleOpenPDF}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-semibold transition-colors">
                <Printer size={14} />
                PDF
              </button>
              {invoice.statut === 'brouillon' && (
                <>
                  <button onClick={() => onEdit(invoice)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-xs font-semibold transition-colors">
                    <Pencil size={14} />
                    Modifier
                  </button>
                  <button onClick={() => onEmettre(invoice)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-semibold transition-colors">
                    <CheckCircle size={14} />
                    Émettre
                  </button>
                </>
              )}
              {['emise', 'partiellement_reglee'].includes(invoice.statut) && (
                <button onClick={() => onPayment(invoice)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white hover:bg-green-700 rounded-xl text-xs font-semibold transition-colors">
                  <CreditCard size={14} />
                  Règlement
                </button>
              )}
              <button onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Cartes infos clés */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCard label="Référence" value={invoice.reference} icon="🏷️" />
            <InfoCard label="Date d'émission" value={formatDate(invoice.date_emission)} icon="📅" />
            <InfoCard label="Date d'échéance" value={invoice.date_echeance ? formatDate(invoice.date_echeance) : '--/--/----'} icon="📆" />
            <InfoCard label="Total TTC" value={formatPrice(invoice.total_ttc)} icon="💰" />
          </div>
          {invoice.mode_paiement && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="text-base">💳</span>
              <span className="font-medium text-gray-700">Mode de paiement :</span>
              <span className="capitalize">{invoice.mode_paiement}</span>
            </div>
          )}

          {/* Si règlement partiel */}
          {['emise', 'partiellement_reglee'].includes(invoice.statut) && (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-3 flex items-center justify-between">
              <span className="text-sm text-orange-700 font-medium">Reste à régler</span>
              <span className="font-black text-orange-600 text-lg">{formatPrice(resteARegler)}</span>
            </div>
          )}

          {/* Articles */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚚</span>
                <h3 className="font-bold text-gray-900">Articles</h3>
              </div>
              <span className="text-xs text-gray-400 font-medium">Montants exprimés en MAD</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Désignation</th>
                    <th className="px-3 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">P.U HT</th>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Qté.</th>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">TVA</th>
                    {invoice.discount_percent > 0 && (
                      <th className="px-3 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Réduc. HT</th>
                    )}
                    <th className="px-5 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-6 text-center text-gray-400 text-sm">Aucun article</td>
                    </tr>
                  ) : items.map((item, idx) => {
                    const totalBrut = item.quantite * item.prix_ht;
                    const reduc = totalBrut * (invoice.discount_percent / 100);
                    const totalNet = totalBrut - reduc;
                    return (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">{item.designation}</td>
                        <td className="px-3 py-3 text-sm text-gray-600 text-right">{item.prix_ht.toFixed(2)}</td>
                        <td className="px-3 py-3 text-sm text-gray-600 text-center">{item.quantite}</td>
                        <td className="px-3 py-3 text-sm text-gray-600 text-center">{item.tva_pct}%</td>
                        {invoice.discount_percent > 0 && (
                          <td className="px-3 py-3 text-sm text-red-500 text-right">{reduc.toFixed(2)} MAD</td>
                        )}
                        <td className="px-5 py-3 text-sm font-semibold text-gray-900 text-right">{totalNet.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totaux */}
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total HT</span>
                    <span className="font-semibold text-gray-900">{formatPrice(invoice.total_ht)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total TVA</span>
                    <span className="font-semibold text-gray-900">{formatPrice(invoice.total_tva)}</span>
                  </div>
                  {invoice.discount_percent > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Réductions HT</span>
                      <span className="font-semibold text-red-500">- {formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="font-bold text-gray-900">Total TTC</span>
                    <span className="font-black text-xl text-blue-600">{formatPrice(invoice.total_ttc)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes et montant en lettres */}
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 space-y-3">
            {invoice.notes && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-gray-600">{invoice.notes}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Arrêté la présente facture à la somme de :
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {numberToWordsFr(invoice.total_ttc)}
              </p>
            </div>
          </div>

        </div>
      </div>

      {pdfDoc && <FactureModal doc={pdfDoc} onClose={() => setPdfDoc(null)} />}
    </>
  );
}
