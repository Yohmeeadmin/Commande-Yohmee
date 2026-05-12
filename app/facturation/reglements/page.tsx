'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, CreditCard, Trash2, X, Banknote, Building2, CheckSquare, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import type { Client } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

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

async function nextReference(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data } = await supabase
    .from('payments').select('reference').like('reference', `PAY-${ym}-%`)
    .order('reference', { ascending: false }).limit(1);
  const last = data?.[0]?.reference;
  const num = last ? parseInt(last.split('-').pop() ?? '0') + 1 : 1;
  return `PAY-${ym}-${String(num).padStart(4, '0')}`;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function ReglementsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [formClientId, setFormClientId] = useState('');
  const [formDate, setFormDate] = useState(localDateStr());
  const [formMontant, setFormMontant] = useState('');
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

  async function loadClientInvoices(clientId: string) {
    const { data } = await supabase
      .from('invoices')
      .select('id, reference, statut, total_ttc, total_regle, client_id')
      .eq('client_id', clientId)
      .in('statut', ['emise', 'partiellement_reglee'])
      .order('date_emission');
    setInvoices(data ?? []);
    setFormInvoices((data ?? []).map((inv: Invoice) => ({ id: inv.id, montant: 0 })));
  }

  function openCreate() {
    setFormClientId(''); setFormDate(localDateStr());
    setFormMontant(''); setFormMode('virement'); setFormNotes('');
    setInvoices([]); setFormInvoices([]);
    setModalOpen(true);
  }

  async function handleClientChange(clientId: string) {
    setFormClientId(clientId);
    if (clientId) await loadClientInvoices(clientId);
    else { setInvoices([]); setFormInvoices([]); }
  }

  function updateInvoiceMontant(id: string, montant: number) {
    setFormInvoices(prev => prev.map(fi => fi.id === id ? { ...fi, montant } : fi));
  }

  async function handleSave() {
    const montant = parseFloat(formMontant);
    if (!formClientId || isNaN(montant) || montant <= 0) return;
    setSaving(true);

    const reference = await nextReference();
    const { data: pay } = await supabase.from('payments').insert({
      reference, client_id: formClientId, date: formDate,
      montant, mode: formMode, notes: formNotes || null,
    }).select().single();

    if (pay) {
      const appliques = formInvoices.filter(fi => fi.montant > 0);
      if (appliques.length > 0) {
        await supabase.from('payment_invoices').insert(
          appliques.map(fi => ({ payment_id: pay.id, invoice_id: fi.id, montant_applique: fi.montant }))
        );
        // Mise à jour des factures
        for (const fi of appliques) {
          const inv = invoices.find(i => i.id === fi.id);
          if (!inv) continue;
          const newRegle = inv.total_regle + fi.montant;
          const newStatut = newRegle >= inv.total_ttc ? 'soldee' : 'partiellement_reglee';
          await supabase.from('invoices').update({ total_regle: newRegle, statut: newStatut, updated_at: new Date().toISOString() }).eq('id', fi.id);
        }
      }
    }

    setSaving(false); setModalOpen(false); load();
  }

  async function handleDelete(p: Payment) {
    if (!confirm(`Supprimer le règlement ${p.reference} ? Les factures ne seront pas mises à jour automatiquement.`)) return;
    await supabase.from('payments').delete().eq('id', p.id);
    load();
  }

  const filtered = payments.filter(p =>
    search === '' ||
    p.reference.toLowerCase().includes(search.toLowerCase()) ||
    (p.clients?.nom ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalMontantAlloue = formInvoices.reduce((s, fi) => s + fi.montant, 0);
  const montant = parseFloat(formMontant) || 0;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Règlements</h1>
          <p className="text-gray-400 text-sm mt-0.5">{payments.length} règlements enregistrés</p>
        </div>
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
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <CreditCard size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucun règlement trouvé</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4">
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
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Nouveau règlement</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Client */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                <select value={formClientId} onChange={e => handleClientChange(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date *</label>
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

              {/* Mode */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode de paiement</label>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {MODES_PAIEMENT.map(m => {
                    const Icon = m.icon;
                    return (
                      <button key={m.value} onClick={() => setFormMode(m.value)}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${formMode === m.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        <Icon size={16} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
                <input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Réf. virement, chèque n°…"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Imputation sur factures */}
              {invoices.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Imputer sur les factures en cours
                  </label>
                  <div className="mt-2 space-y-2">
                    {invoices.map(inv => {
                      const fi = formInvoices.find(x => x.id === inv.id);
                      const resteARegler = Math.max(0, inv.total_ttc - inv.total_regle);
                      return (
                        <div key={inv.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{inv.reference}</p>
                            <p className="text-xs text-gray-400">Reste : {formatPrice(resteARegler)}</p>
                          </div>
                          <input
                            type="number" min="0" step="0.01" max={resteARegler}
                            value={fi?.montant ?? 0}
                            onChange={e => updateInvoiceMontant(inv.id, parseFloat(e.target.value) || 0)}
                            className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      );
                    })}
                    {montant > 0 && (
                      <div className="flex justify-between text-sm pt-1">
                        <span className="text-gray-500">Total imputé</span>
                        <span className={`font-bold ${totalMontantAlloue > montant ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatPrice(totalMontantAlloue)} / {formatPrice(montant)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving || !formClientId || !formMontant || parseFloat(formMontant) <= 0}
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
