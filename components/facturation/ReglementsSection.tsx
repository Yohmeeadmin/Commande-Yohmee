'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, CreditCard, Trash2, X, Banknote, Building2, CheckSquare, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import type { Client } from '@/types';
import { nextRef } from '@/lib/facturation';
import { useToast } from '@/components/ui/Toast';

interface Payment {
  id: string;
  reference: string;
  date: string;
  montant: number;
  mode: string;
  notes: string | null;
  client_id: string | null;
  clients: { nom: string } | null;
  payment_invoices?: { montant_applique: number; invoices: { reference: string } | null }[];
}

interface Invoice {
  id: string;
  reference: string;
  statut: string;
  total_ttc: number;
  total_regle: number;
  client_id: string | null;
  clients?: { nom: string } | null;
}

const MODES_PAIEMENT = [
  { value: 'virement', label: 'Virement', icon: Building2 },
  { value: 'especes', label: 'Espèces', icon: Banknote },
  { value: 'cheque', label: 'Chèque', icon: CheckSquare },
  { value: 'carte', label: 'Carte', icon: CreditCard },
  { value: 'avoir', label: 'Avoir', icon: Wallet },
];

function modeLabel(m: string) {
  return MODES_PAIEMENT.find(x => x.value === m)?.label ?? m;
}

export default function ReglementsSection() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Form
  const [formClientId, setFormClientId] = useState('');
  const [formDate, setFormDate] = useState(localDateStr());
  const [formMode, setFormMode] = useState('virement');
  const [formNotes, setFormNotes] = useState('');
  const [formInvoices, setFormInvoices] = useState<{ id: string; montant: number }[]>([]);

  const load = useCallback(async () => {
    const [paymentsRes, clientsRes] = await Promise.all([
      supabase.from('payments')
        .select('*, clients(nom), payment_invoices(montant_applique, invoices(reference))')
        .order('date', { ascending: false }),
      supabase.from('clients').select('id, nom').eq('is_active', true).order('nom'),
    ]);
    setPayments(paymentsRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleClientChange(clientId: string) {
    setFormClientId(clientId);
    setFormInvoices([]);
    setInvoices([]);
    if (!clientId) return;
    const { data } = await supabase
      .from('invoices')
      .select('id, reference, statut, total_ttc, total_regle, client_id, date_emission')
      .eq('client_id', clientId)
      .in('statut', ['emise', 'partiellement_reglee'])
      .order('date_emission');
    const list: Invoice[] = data ?? [];
    setInvoices(list);
    setFormInvoices(list.map(inv => ({ id: inv.id, montant: 0 })));
  }

  function openCreate() {
    setFormClientId('');
    setFormDate(localDateStr());
    setFormMode('virement');
    setFormNotes('');
    setFormInvoices([]);
    setInvoices([]);
    setModalOpen(true);
  }

  function updateInvoiceMontant(id: string, montant: number) {
    setFormInvoices(prev => prev.map(fi => fi.id === id ? { ...fi, montant } : fi));
  }

  async function handleSave() {
    const montant = formInvoices.reduce((s, fi) => s + fi.montant, 0);
    if (!formClientId || montant <= 0) return;
    setSaving(true);

    const reference = await nextRef('PAY', 'payments');
    const { data: pay, error } = await supabase.from('payments').insert({
      reference, client_id: formClientId, date: formDate,
      montant, mode: formMode, notes: formNotes || null,
    }).select().single();

    if (error || !pay) {
      toast.error(`Erreur : ${error?.message ?? 'Création échouée'}`);
      setSaving(false);
      return;
    }

    const appliques = formInvoices.filter(fi => fi.montant > 0);
    if (appliques.length > 0) {
      await supabase.from('payment_invoices').insert(
        appliques.map(fi => ({ payment_id: pay.id, invoice_id: fi.id, montant_applique: fi.montant }))
      );
      for (const fi of appliques) {
        const inv = invoices.find(i => i.id === fi.id);
        if (!inv) continue;
        const newRegle = inv.total_regle + fi.montant;
        const newStatut = newRegle >= inv.total_ttc ? 'soldee' : 'partiellement_reglee';
        await supabase.from('invoices').update({ total_regle: newRegle, statut: newStatut, updated_at: new Date().toISOString() }).eq('id', fi.id);
      }
    }

    toast.success(`Règlement ${reference} enregistré`);
    setSaving(false); setModalOpen(false); load();
  }

  async function handleDelete(p: Payment) {
    if (!confirm(`Supprimer le règlement ${p.reference} ? Les factures ne seront pas mises à jour automatiquement.`)) return;
    const { error } = await supabase.from('payments').delete().eq('id', p.id);
    if (error) { toast.error(`Erreur : ${error.message}`); return; }
    toast.success(`Règlement ${p.reference} supprimé`);
    load();
  }

  const filtered = payments.filter(p =>
    search === '' ||
    p.reference.toLowerCase().includes(search.toLowerCase()) ||
    (p.clients?.nom ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalMontantAlloue = formInvoices.reduce((s, fi) => s + fi.montant, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{payments.length} règlements enregistrés</p>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
          <Plus size={16} />
          Nouveau règlement
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
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 p-12 text-center">
          <CreditCard size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucun règlement trouvé</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="bg-gray-50 rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">{p.reference}</span>
                  <span className="text-[11px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">{modeLabel(p.mode)}</span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {p.clients?.nom ?? '—'} · {formatDate(p.date)}
                  {p.notes && ` · ${p.notes}`}
                </p>
                {(p.payment_invoices ?? []).length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Factures : {(p.payment_invoices ?? []).map(pi => pi.invoices?.reference ?? '?').join(', ')}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-green-700">{formatPrice(p.montant)}</p>
              </div>
              <button onClick={() => handleDelete(p)} title="Supprimer"
                className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500 shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (() => {
        const totalTTC = invoices.reduce((s, i) => s + i.total_ttc, 0);
        const totalDejaRecu = invoices.reduce((s, i) => s + i.total_regle, 0);
        const totalAPayer = formInvoices.reduce((s, fi) => s + fi.montant, 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Nouveau règlement</h2>
                <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

                {/* Client + Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                    <select value={formClientId} onChange={e => handleClientChange(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">— Sélectionner un client —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date *</label>
                    <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>

                {/* Mode de paiement + Notes */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode de paiement</label>
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {MODES_PAIEMENT.map(m => {
                        const Icon = m.icon;
                        return (
                          <button key={m.value} onClick={() => setFormMode(m.value)}
                            className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[11px] font-semibold transition-colors ${formMode === m.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            <Icon size={14} />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
                    <input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Réf. virement, chèque n°…"
                      className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>

                {/* Factures à solder */}
                <div>
                  <h3 className="font-bold text-gray-800 mb-3">Factures à solder</h3>
                  {!formClientId ? (
                    <div className="border border-green-200 rounded-xl px-5 py-4 text-sm text-green-700 bg-green-50">
                      Veuillez sélectionner un client pour voir ses factures.
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="border border-gray-100 rounded-xl px-5 py-4 text-sm text-gray-400 text-center">
                      Aucune facture en attente pour ce client.
                    </div>
                  ) : (
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Référence</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Montant TTC</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Déjà reçu</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Montant à payer</th>
                            <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {invoices.map(inv => {
                            const fi = formInvoices.find(x => x.id === inv.id);
                            const reste = Math.max(0, inv.total_ttc - inv.total_regle);
                            return (
                              <tr key={inv.id} className="hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{inv.reference}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{formatDate((inv as any).date_emission ?? '')}</td>
                                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatPrice(inv.total_ttc)}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-500">{formatPrice(inv.total_regle)}</td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col items-end gap-1">
                                    <input
                                      type="number" min="0" step="0.01" max={reste}
                                      value={fi?.montant ?? 0}
                                      onChange={e => updateInvoiceMontant(inv.id, parseFloat(e.target.value) || 0)}
                                      className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateInvoiceMontant(inv.id, reste)}
                                      className="text-[11px] text-green-600 hover:text-green-800 hover:underline cursor-pointer"
                                    >
                                      Restant : {formatPrice(reste)}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${inv.statut === 'emise' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {inv.statut === 'emise' ? 'À régler' : 'Partiel'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                            <td className="px-4 py-3 text-sm">{invoices.length} Facture{invoices.length > 1 ? 's' : ''}</td>
                            <td />
                            <td className="px-4 py-3 text-sm text-right">{formatPrice(totalTTC)}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatPrice(totalDejaRecu)}</td>
                            <td className="px-4 py-3 text-sm text-right text-green-700 font-black">{formatPrice(totalAPayer)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Total à enregistrer : <span className="font-black text-gray-900">{formatPrice(formInvoices.reduce((s, fi) => s + fi.montant, 0))}</span>
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    Annuler
                  </button>
                  <button onClick={handleSave}
                    disabled={saving || !formClientId || formInvoices.every(fi => fi.montant === 0)}
                    className="px-5 py-2 bg-green-700 text-white rounded-xl text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors">
                    {saving ? 'Enregistrement…' : 'Enregistrer le règlement'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
