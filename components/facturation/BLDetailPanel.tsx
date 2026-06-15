'use client';

import { useEffect, useState } from 'react';
import { X, Printer, Pencil, Trash2, Receipt, CheckCircle } from 'lucide-react';
import { formatPrice, formatDate } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import { numberToWordsFr } from '@/components/livraisons/BonLivraison';
import BLModal from '@/components/livraisons/BLModal';
import type { BLOrder } from '@/components/livraisons/BonLivraison';
import type { Client } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { createInvoiceFromBL, STATUTS_BL } from '@/lib/facturation';
import { useToast } from '@/components/ui/Toast';

interface BLItem {
  display_name: string;
  unit_price: number;
  quantity: number;
  vat_rate: number;
}

interface BonLivraison {
  id: string;
  numero: string;
  client_nom: string;
  delivery_date: string;
  statut: string;
  items: BLItem[];
}

interface Props {
  bl: BonLivraison;
  clients: Client[];
  onClose: () => void;
  onEdit: (bl: BonLivraison) => void;
  onDelete: (bl: BonLivraison) => void;
  onEmettre?: (bl: BonLivraison) => void;
  onFacture?: () => void; // callback après facturation réussie
}

export default function BLDetailPanel({ bl, clients, onClose, onEdit, onDelete, onEmettre, onFacture }: Props) {
  const [mounted, setMounted] = useState(false);
  const [blPreview, setBlPreview] = useState<BLOrder[] | null>(null);
  const { settings } = useAppSettings();
  const { toast } = useToast();

  // Facturation
  const [isBilled, setIsBilled] = useState<string | null>(null); // null=unknown, ''=non facturé, ref=facturé
  const [factureModal, setFactureModal] = useState(false);
  const [factureClientId, setFactureClientId] = useState('');
  const [facturing, setFacturing] = useState(false);

  // Détecte si déjà facturé
  useEffect(() => {
    supabase.from('invoice_bons_livraison')
      .select('invoices(reference)')
      .eq('bon_livraison_id', bl.id)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        setIsBilled(data ? (data.invoices?.reference ?? 'Facturé') : '');
        // Pré-sélectionne le client s'il existe
        const found = clients.find(c => c.nom.toLowerCase() === bl.client_nom.toLowerCase());
        if (found) setFactureClientId(found.id);
      });
  }, [bl.id, bl.client_nom, clients]);

  async function handleFacturer() {
    if (!factureClientId) return;
    setFacturing(true);
    const result = await createInvoiceFromBL(bl, factureClientId, formatDate);
    setFacturing(false);
    setFactureModal(false);
    if (result.ok) {
      setIsBilled(result.reference);
      toast.success(`Facture ${result.reference} créée`);
      onFacture?.();
    } else {
      toast.error(`Erreur : ${result.error}`);
    }
  }

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  function openPreview() {
    const client = clients.find(c => c.nom === bl.client_nom);
    const co = {
      raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege,
      code_postal: settings.code_postal, ville_siege: settings.ville_siege,
      telephone_societe: settings.telephone_societe, email_societe: settings.email_societe,
      site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal,
      ice_societe: settings.ice_societe, tp: settings.tp, cnss: settings.cnss,
    };
    setBlPreview([{
      numero: bl.numero,
      delivery_date: bl.delivery_date,
      client: {
        nom: bl.client_nom,
        ice: client?.ice ?? null,
        adresse_livraison: client?.adresse_livraison ?? null,
        code: client?.code ?? null,
      },
      items: bl.items ?? [],
      logoUrl: settings.logo_url,
      company: co,
    }]);
  }

  const items = bl.items ?? [];
  const totalHT = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const totalTVA = items.reduce((s, i) => s + i.quantity * i.unit_price * (i.vat_rate / 100), 0);
  const totalTTC = totalHT + totalTVA;

  // Group by vat for display
  const vatGroups: Record<number, number> = {};
  items.forEach(i => {
    vatGroups[i.vat_rate] = (vatGroups[i.vat_rate] ?? 0) + i.quantity * i.unit_price * (i.vat_rate / 100);
  });

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

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <span className="text-teal-600 font-black text-lg">
                  {(bl.client_nom ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-gray-900 text-lg truncate">{bl.client_nom}</h2>
                  <span className="text-xs font-mono text-gray-400">{bl.numero}</span>
                  {(() => {
                    const s = STATUTS_BL[bl.statut] ?? STATUTS_BL.brouillon;
                    return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${s.color} ${s.bg}`}>{s.label}</span>;
                  })()}
                </div>
                <p className="text-sm text-gray-400 mt-0.5">Livraison du {formatDate(bl.delivery_date)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button onClick={openPreview}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-semibold transition-colors">
                <Printer size={14} />
                PDF
              </button>
              {bl.statut === 'brouillon' && onEmettre && (
                <button onClick={() => onEmettre(bl)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-semibold transition-colors">
                  <CheckCircle size={14} />
                  Émettre
                </button>
              )}
              <button onClick={() => onEdit(bl)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-xs font-semibold transition-colors">
                <Pencil size={14} />
                Modifier
              </button>
              {isBilled === '' && (
                <button onClick={() => setFactureModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-semibold transition-colors">
                  <Receipt size={14} />
                  Facturer
                </button>
              )}
              {isBilled && (
                <span className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-xl text-xs font-semibold">
                  <CheckCircle size={14} />
                  {isBilled}
                </span>
              )}
              <button onClick={() => onDelete(bl)}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-semibold transition-colors">
                <Trash2 size={14} />
                Supprimer
              </button>
              <button onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Cartes infos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <InfoCard label="Référence" value={bl.numero} icon="🏷️" />
            <InfoCard label="Date de livraison" value={formatDate(bl.delivery_date)} icon="📅" />
            <InfoCard label="Total TTC" value={formatPrice(totalTTC)} icon="💰" />
          </div>

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
                    <th className="px-5 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-gray-400 text-sm">Aucun article</td>
                    </tr>
                  ) : items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{item.display_name}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 text-right">{item.unit_price.toFixed(2)}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 text-center">{item.quantity}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 text-center">{item.vat_rate}%</td>
                      <td className="px-5 py-3 text-sm font-semibold text-gray-900 text-right">
                        {(item.quantity * item.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totaux */}
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total HT</span>
                    <span className="font-semibold text-gray-900">{formatPrice(totalHT)}</span>
                  </div>
                  {Object.entries(vatGroups).filter(([, v]) => v > 0).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, tva]) => (
                    <div key={rate} className="flex justify-between text-sm">
                      <span className="text-gray-500">Total TVA {rate}%</span>
                      <span className="font-semibold text-gray-900">{formatPrice(tva)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="font-bold text-gray-900">Total TTC</span>
                    <span className="font-black text-xl text-teal-600">{formatPrice(totalTTC)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Montant en lettres */}
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Arrêté le présent bon de livraison à la somme de :
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {numberToWordsFr(totalTTC)}
            </p>
          </div>

        </div>
      </div>

      {blPreview && (
        <BLModal
          orders={blPreview}
          title={blPreview[0]?.numero}
          onClose={() => setBlPreview(null)}
        />
      )}

      {/* Modal facturation */}
      {factureModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Créer une facture</h2>
                <p className="text-sm text-gray-400">depuis {bl.numero}</p>
              </div>
              <button onClick={() => setFactureModal(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Récap articles */}
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-100 text-sm">
                {(bl.items ?? []).map((item, i) => (
                  <div key={i} className="flex justify-between px-3 py-2">
                    <span className="text-gray-700">{item.display_name} × {item.quantity}</span>
                    <span className="font-semibold text-gray-900">{formatPrice(item.quantity * item.unit_price)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 font-black text-gray-900">
                  <span>Total HT</span>
                  <span>{formatPrice(totalHT)}</span>
                </div>
              </div>

              {/* Client */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                <select value={factureClientId} onChange={e => setFactureClientId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setFactureModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleFacturer} disabled={facturing || !factureClientId}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <Receipt size={15} />
                {facturing ? 'Création…' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
