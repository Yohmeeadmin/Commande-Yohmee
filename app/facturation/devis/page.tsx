'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, FileText, Printer, Pencil, Trash2, ChevronRight, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import FactureModal from '@/components/facturation/FactureModal';
import type { FactureDoc, FactureItem } from '@/components/facturation/FacturePDF';
import type { Client } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DevisItem {
  id?: string;
  designation: string;
  quantite: number;
  prix_ht: number;
  tva_pct: number;
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

const STATUTS: { value: string; label: string; color: string; bg: string }[] = [
  { value: 'brouillon', label: 'Brouillon', color: 'text-gray-600', bg: 'bg-gray-100' },
  { value: 'envoye', label: 'Envoyé', color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'accepte', label: 'Accepté', color: 'text-green-600', bg: 'bg-green-100' },
  { value: 'refuse', label: 'Refusé', color: 'text-red-600', bg: 'bg-red-100' },
  { value: 'converti', label: 'Converti', color: 'text-purple-600', bg: 'bg-purple-100' },
];

const EMPTY_ITEM: DevisItem = { designation: '', quantite: 1, prix_ht: 0, tva_pct: 20 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function nextReference(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data } = await supabase
    .from('devis')
    .select('reference')
    .like('reference', `DEV-${ym}-%`)
    .order('reference', { ascending: false })
    .limit(1);
  const last = data?.[0]?.reference;
  const num = last ? parseInt(last.split('-').pop() ?? '0') + 1 : 1;
  return `DEV-${ym}-${String(num).padStart(4, '0')}`;
}

function calcTotals(items: DevisItem[]) {
  const total_ht = items.reduce((s, i) => s + i.quantite * i.prix_ht, 0);
  const total_tva = items.reduce((s, i) => s + i.quantite * i.prix_ht * (i.tva_pct / 100), 0);
  return { total_ht, total_tva, total_ttc: total_ht + total_tva };
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function DevisPage() {
  const [devis, setDevis] = useState<Devis[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Devis | null>(null);
  const [pdfDoc, setPdfDoc] = useState<FactureDoc | null>(null);
  const { settings } = useAppSettings();

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formDateEmission, setFormDateEmission] = useState(localDateStr());
  const [formDateValidite, setFormDateValidite] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formConditions, setFormConditions] = useState('');
  const [formItems, setFormItems] = useState<DevisItem[]>([{ ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [devisRes, clientsRes] = await Promise.all([
      supabase.from('devis')
        .select('*, clients(nom, ice, adresse_livraison, code), devis_items(*)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, nom, ice, adresse_livraison, code').eq('is_active', true).order('nom'),
    ]);
    setDevis(devisRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setFormClientId('');
    setFormDateEmission(localDateStr());
    setFormDateValidite('');
    setFormNotes('');
    setFormConditions('');
    setFormItems([{ ...EMPTY_ITEM }]);
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
      id: i.id,
      designation: i.designation,
      quantite: i.quantite,
      prix_ht: i.prix_ht,
      tva_pct: i.tva_pct,
    })) ?? [{ ...EMPTY_ITEM }]);
    setModalOpen(true);
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
      await supabase.from('devis').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      await supabase.from('devis_items').delete().eq('devis_id', editing.id);
      const items = formItems.map((item, pos) => ({ devis_id: editing.id, ...item, position: pos, id: undefined }));
      await supabase.from('devis_items').insert(items);
    } else {
      const reference = await nextReference();
      const { data } = await supabase.from('devis').insert({ ...payload, reference, statut: 'brouillon' }).select().single();
      if (data) {
        const items = formItems.map((item, pos) => ({ devis_id: data.id, ...item, position: pos }));
        await supabase.from('devis_items').insert(items);
      }
    }

    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function handleDelete(d: Devis) {
    if (!confirm(`Supprimer le devis ${d.reference} ?`)) return;
    await supabase.from('devis').delete().eq('id', d.id);
    load();
  }

  async function handleStatut(d: Devis, newStatut: string) {
    await supabase.from('devis').update({ statut: newStatut, updated_at: new Date().toISOString() }).eq('id', d.id);
    load();
  }

  function openPDF(d: Devis) {
    const client = clients.find(c => c.id === d.client_id);
    const co = {
      raison_sociale: settings.raison_sociale,
      adresse_siege: settings.adresse_siege,
      code_postal: settings.code_postal,
      ville_siege: settings.ville_siege,
      telephone_societe: settings.telephone_societe,
      email_societe: settings.email_societe,
      site_web: settings.site_web,
      rc: settings.rc,
      if_fiscal: settings.if_fiscal,
      ice_societe: settings.ice_societe,
      tp: settings.tp,
      cnss: settings.cnss,
    };
    setPdfDoc({
      type: 'devis',
      reference: d.reference,
      date_emission: d.date_emission,
      date_validite: d.date_validite,
      client: {
        nom: d.clients?.nom ?? client?.nom ?? '—',
        ice: d.clients?.ice ?? null,
        adresse: d.clients?.adresse_livraison ?? null,
        code: d.clients?.code ?? null,
      },
      items: (d.devis_items ?? []).map(i => ({
        designation: i.designation,
        quantite: i.quantite,
        prix_ht: i.prix_ht,
        tva_pct: i.tva_pct,
      })),
      notes: d.notes,
      conditions: d.conditions,
      company: co,
      logoUrl: settings.logo_url,
    });
  }

  // Filtrage
  const filtered = devis.filter(d => {
    const matchSearch = search === '' ||
      d.reference.toLowerCase().includes(search.toLowerCase()) ||
      (d.clients?.nom ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut === 'all' || d.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  function getStatut(s: string) {
    return STATUTS.find(x => x.value === s) ?? STATUTS[0];
  }

  function updateItem(idx: number, field: keyof DevisItem, value: string | number) {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  const formTotals = calcTotals(formItems);

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Devis</h1>
          <p className="text-gray-400 text-sm mt-0.5">{devis.length} devis</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
          <Plus size={16} />
          Nouveau devis
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1.5">
          {[{ value: 'all', label: 'Tous' }, ...STATUTS].map(s => (
            <button key={s.value}
              onClick={() => setFilterStatut(s.value)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${filterStatut === s.value ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
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
                    {d.date_validite && ` · Valable jusqu'au ${formatDate(d.date_validite)}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-gray-900">{formatPrice(d.total_ttc)}</p>
                  <p className="text-xs text-gray-400">HT : {formatPrice(d.total_ht)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openPDF(d)} title="Aperçu PDF"
                    className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-700">
                    <Printer size={15} />
                  </button>
                  <button onClick={() => openEdit(d)} title="Modifier"
                    className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-700">
                    <Pencil size={15} />
                  </button>
                  {/* Transitions de statut */}
                  {d.statut === 'brouillon' && (
                    <button onClick={() => handleStatut(d, 'envoye')} title="Marquer envoyé"
                      className="px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-semibold flex items-center gap-1">
                      <ChevronRight size={12} /> Envoyer
                    </button>
                  )}
                  {d.statut === 'envoye' && (
                    <>
                      <button onClick={() => handleStatut(d, 'accepte')} title="Accepter"
                        className="px-2.5 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl text-xs font-semibold flex items-center gap-1">
                        <Check size={12} /> Accepter
                      </button>
                      <button onClick={() => handleStatut(d, 'refuse')} title="Refuser"
                        className="px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-semibold flex items-center gap-1">
                        <X size={12} /> Refuser
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(d)} title="Supprimer"
                    className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PDF Modal */}
      {pdfDoc && <FactureModal doc={pdfDoc} onClose={() => setPdfDoc(null)} />}

      {/* Formulaire Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing ? 'Modifier le devis' : 'Nouveau devis'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Client + dates */}
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
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Valable jusqu&apos;au</label>
                  <input type="date" value={formDateValidite} onChange={e => setFormDateValidite(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Items */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lignes</label>
                <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-0 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
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

              {/* Totaux */}
              <div className="flex justify-end">
                <div className="text-right space-y-1">
                  <p className="text-sm text-gray-500">Total HT : <span className="font-bold text-gray-900">{formatPrice(formTotals.total_ht)}</span></p>
                  <p className="text-sm text-gray-500">Total TVA : <span className="font-bold text-gray-900">{formatPrice(formTotals.total_tva)}</span></p>
                  <p className="text-base text-gray-900 font-black">Total TTC : {formatPrice(formTotals.total_ttc)}</p>
                </div>
              </div>

              {/* Notes / Conditions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
                  <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conditions</label>
                  <textarea value={formConditions} onChange={e => setFormConditions(e.target.value)} rows={3}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving || !formClientId}
                className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le devis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
