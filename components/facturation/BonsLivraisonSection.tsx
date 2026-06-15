'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Truck, Printer, Trash2, Pencil, X, ArrowUpDown, ArrowUp, ArrowDown, Search, CheckCircle, ChevronDown, Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate, localDateStr } from '@/lib/utils';
import { useAppSettings } from '@/lib/useAppSettings';
import BLModal from '@/components/livraisons/BLModal';
import BLDetailPanel from '@/components/facturation/BLDetailPanel';
import type { BLOrder } from '@/components/livraisons/BonLivraison';
import type { Client } from '@/types';
import { nextRef, createInvoiceFromBL, STATUTS_BL } from '@/lib/facturation';
import { useToast } from '@/components/ui/Toast';
import { deduireStockBL } from '@/lib/stock-pf';
import { useUser } from '@/contexts/UserContext';

interface BLItem {
  display_name: string;
  unit_price: number;
  quantity: number;
  vat_rate: number;
  remise?: number;
}

interface BonLivraison {
  id: string;
  numero: string;
  client_nom: string;
  delivery_date: string;
  statut: string;
  items: BLItem[];
}

interface CatalogArticle {
  id: string;
  display_name: string;
  prix_pro: number | null;
  custom_price: number | null;
}

type SortField = 'numero' | 'client_nom' | 'total_ht' | 'delivery_date';
type SortDir = 'asc' | 'desc';

const EMPTY_ITEM: BLItem = { display_name: '', unit_price: 0, quantity: 1, vat_rate: 20, remise: 0 };
const TVA_RATES = [0, 7, 10, 14, 20];

function SortHeader({ label, field, sort, onSort }: {
  label: string; field: SortField;
  sort: { field: SortField; dir: SortDir };
  onSort: (f: SortField) => void;
}) {
  const active = sort.field === field;
  return (
    <th onClick={() => onSort(field)}
      className="px-3 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 whitespace-nowrap">
      <div className="flex items-center gap-1">
        {label}
        <span className="text-gray-300">
          {active
            ? sort.dir === 'asc' ? <ArrowUp size={12} className="text-teal-500" /> : <ArrowDown size={12} className="text-teal-500" />
            : <ArrowUpDown size={12} />}
        </span>
      </div>
    </th>
  );
}

export default function BonsLivraisonSection({ onNavigateToFactures }: { onNavigateToFactures?: () => void }) {
  const [bls, setBls] = useState<BonLivraison[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<CatalogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BonLivraison | null>(null);
  const [saving, setSaving] = useState(false);
  const [blPreview, setBlPreview] = useState<BLOrder[] | null>(null);
  const [detailBL, setDetailBL] = useState<BonLivraison | null>(null);
  const { settings } = useAppSettings();
  const { toast } = useToast();
  const { profile } = useUser();

  // Tri
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'delivery_date', dir: 'desc' });

  // Filtres
  const [fNumero, setFNumero] = useState('');
  const [fClient, setFClient] = useState('');
  const [fStatut, setFStatut] = useState('');
  const [fDateDu, setFDateDu] = useState('');
  const [fDateAu, setFDateAu] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(true);

  // Sélection multiple
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [etatDropdownOpen, setEtatDropdownOpen] = useState(false);
  const [bulkFactureModal, setBulkFactureModal] = useState(false);
  const [bulkFactureClientId, setBulkFactureClientId] = useState('');
  const [bulkFacturing, setBulkFacturing] = useState(false);

  // Facturation directe depuis la ligne
  const [factureDirectBL, setFactureDirectBL] = useState<BonLivraison | null>(null);
  const [factureDirectClientId, setFactureDirectClientId] = useState('');
  const [facturingDirect, setFacturingDirect] = useState(false);

  // Form
  const [formClientId, setFormClientId] = useState('');
  const [formClientNom, setFormClientNom] = useState('');
  const [formDate, setFormDate] = useState(localDateStr());
  const [formEcheance, setFormEcheance] = useState('');
  const [formModePaiement, setFormModePaiement] = useState('');
  const [formStatut, setFormStatut] = useState('brouillon');
  const [formItems, setFormItems] = useState<BLItem[]>([{ ...EMPTY_ITEM }]);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [blsRes, clientsRes, articlesRes] = await Promise.all([
      supabase.from('bons_livraison').select('*').order('delivery_date', { ascending: false }),
      supabase.from('clients').select('id, nom, ice, adresse_livraison, code').eq('is_active', true).order('nom'),
      supabase.from('product_articles').select('id, display_name, prix_pro, custom_price').order('display_name'),
    ]);
    setBls(blsRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setArticles(articlesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Sort & filter ────────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' }
    );
  }

  const hasFilters = fNumero || fClient || fStatut || fDateDu || fDateAu;

  function clearFilters() { setFNumero(''); setFClient(''); setFStatut(''); setFDateDu(''); setFDateAu(''); }

  const filtered = useMemo(() => {
    let list = bls.map(bl => ({
      ...bl,
      _totalHT: (bl.items ?? []).reduce((s, i) => s + i.quantity * i.unit_price, 0),
    }));

    if (fNumero) list = list.filter(b => b.numero.toLowerCase().includes(fNumero.toLowerCase()));
    if (fClient) list = list.filter(b => b.client_nom.toLowerCase().includes(fClient.toLowerCase()));
    if (fStatut) list = list.filter(b => b.statut === fStatut);
    if (fDateDu) list = list.filter(b => b.delivery_date >= fDateDu);
    if (fDateAu) list = list.filter(b => b.delivery_date <= fDateAu);

    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sort.field === 'numero') { va = a.numero; vb = b.numero; }
      else if (sort.field === 'client_nom') { va = a.client_nom; vb = b.client_nom; }
      else if (sort.field === 'total_ht') { va = a._totalHT; vb = b._totalHT; }
      else if (sort.field === 'delivery_date') { va = a.delivery_date; vb = b.delivery_date; }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [bls, fNumero, fClient, fStatut, fDateDu, fDateAu, sort]);

  // ── Sélection ───────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(b => b.id)));
  }

  async function handleEmettre(bl: BonLivraison) {
    await supabase.from('bons_livraison').update({ statut: 'emis' }).eq('id', bl.id);
    const orderId = (bl as any).order_id ?? null;
    await deduireStockBL(orderId, profile?.email ?? undefined);
    load();
  }

  async function handleBulkEmettre() {
    const brouillons = filtered.filter(b => selected.has(b.id) && b.statut === 'brouillon');
    if (brouillons.length === 0) return;
    await supabase.from('bons_livraison').update({ statut: 'emis' }).in('id', brouillons.map(b => b.id));
    for (const bl of brouillons) {
      await deduireStockBL((bl as any).order_id ?? null, profile?.email ?? undefined);
    }
    setSelected(new Set());
    load();
  }

  async function handleBulkChangerEtat(statut: string) {
    const { error } = await supabase.from('bons_livraison').update({ statut }).in('id', [...selected]);
    if (error) { console.error('Erreur changement état:', error.message); alert(`Erreur : ${error.message}`); return; }
    setEtatDropdownOpen(false);
    setSelected(new Set());
    load();
  }

  async function handleBulkFacturer() {
    if (!bulkFactureClientId) return;
    setBulkFacturing(true);
    const selectedBLs = filtered.filter(b => selected.has(b.id));
    let successes = 0;
    let failures = 0;
    for (const bl of selectedBLs) {
      const result = await createInvoiceFromBL(bl, bulkFactureClientId, formatDate);
      if (result.ok) {
        successes++;
      } else {
        failures++;
        console.error(`Erreur BL ${bl.numero} :`, result.error);
      }
    }
    setBulkFacturing(false);
    setBulkFactureModal(false);
    setBulkFactureClientId('');
    setSelected(new Set());
    load();
    if (failures === 0) {
      toast.success(`${successes} facture${successes > 1 ? 's créées' : ' créée'} avec succès`);
      onNavigateToFactures?.();
    } else if (successes > 0) {
      toast.error(`${successes} facture${successes > 1 ? 's créées' : ' créée'}, ${failures} échec${failures > 1 ? 's' : ''}`);
    } else {
      toast.error(`Échec de la facturation (${failures} erreur${failures > 1 ? 's' : ''})`);
    }
  }

  async function handleFactureDirect() {
    if (!factureDirectBL || !factureDirectClientId) return;
    setFacturingDirect(true);
    const result = await createInvoiceFromBL(factureDirectBL, factureDirectClientId, formatDate);
    setFacturingDirect(false);
    setFactureDirectBL(null);
    setFactureDirectClientId('');
    load();
    if (result.ok) {
      toast.success(`Facture ${result.reference} créée`);
      onNavigateToFactures?.();
    } else {
      toast.error(`Erreur : ${result.error}`);
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selected.size} bon${selected.size > 1 ? 's' : ''} de livraison ?`)) return;
    setBulkDeleting(true);
    await supabase.from('bons_livraison').delete().in('id', [...selected]);
    setSelected(new Set());
    setBulkDeleting(false);
    load();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  function finDuMois(base: string): string {
    const [y, m] = base.split('-').map(Number);
    return `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
  }

  function openCreate() {
    setEditing(null);
    setFormClientId(''); setFormClientNom('');
    const today = localDateStr();
    setFormDate(today);
    setFormEcheance(finDuMois(today));
    setFormModePaiement('');
    setFormStatut('brouillon');
    setFormItems([{ ...EMPTY_ITEM }]);
    setModalOpen(true);
  }

  function openEdit(bl: BonLivraison) {
    setEditing(bl);
    const client = clients.find(c => c.nom === bl.client_nom);
    setFormClientId(client?.id ?? '');
    setFormClientNom(bl.client_nom);
    setFormDate(bl.delivery_date);
    setFormEcheance((bl as any).echeance ?? finDuMois(bl.delivery_date));
    setFormModePaiement((bl as any).mode_paiement ?? '');
    setFormStatut(bl.statut ?? 'brouillon');
    setFormItems(bl.items?.length ? bl.items.map(i => ({ ...i })) : [{ ...EMPTY_ITEM }]);
    setModalOpen(true);
  }

  function handleClientChange(clientId: string) {
    setFormClientId(clientId);
    setFormClientNom(clients.find(x => x.id === clientId)?.nom ?? '');
  }

  function updateItem(idx: number, field: keyof BLItem, value: string | number) {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  function applyArticle(idx: number, articleId: string) {
    const art = articles.find(a => a.id === articleId);
    if (!art) return;
    const price = art.custom_price ?? art.prix_pro ?? 0;
    setFormItems(prev => prev.map((it, i) => i === idx
      ? { ...it, display_name: art.display_name, unit_price: price }
      : it
    ));
    setActiveDropdown(null);
  }

  async function handleSave() {
    const clientNom = formClientNom.trim();
    if (!clientNom || formItems.some(i => !i.display_name)) return;
    setSaving(true);
    const payload = {
      client_nom: clientNom,
      delivery_date: formDate,
      echeance: formEcheance || null,
      mode_paiement: formModePaiement || null,
      statut: formStatut,
      items: formItems,
    };
    if (editing) {
      const { error } = await supabase.from('bons_livraison').update(payload).eq('id', editing.id);
      if (error) {
        toast.error(`Erreur lors de la mise à jour : ${error.message}`);
        setSaving(false);
        return;
      }
      toast.success('Bon de livraison mis à jour');
    } else {
      const numero = await nextRef('BL', 'bons_livraison');
      const { error } = await supabase.from('bons_livraison').insert({ ...payload, numero });
      if (error) {
        toast.error(`Erreur lors de la création : ${error.message}`);
        setSaving(false);
        return;
      }
      toast.success(`BL ${numero} créé`);
    }
    setSaving(false); setModalOpen(false); load();
  }

  async function handleDelete(bl: BonLivraison) {
    if (!confirm(`Supprimer le BL ${bl.numero} ?`)) return;
    await supabase.from('bons_livraison').delete().eq('id', bl.id);
    if (detailBL?.id === bl.id) setDetailBL(null);
    load();
  }

  function openPreview(bl: BonLivraison) {
    const client = clients.find(c => c.nom === bl.client_nom);
    const co = {
      raison_sociale: settings.raison_sociale, adresse_siege: settings.adresse_siege,
      code_postal: settings.code_postal, ville_siege: settings.ville_siege,
      telephone_societe: settings.telephone_societe, email_societe: settings.email_societe,
      site_web: settings.site_web, rc: settings.rc, if_fiscal: settings.if_fiscal,
      ice_societe: settings.ice_societe, tp: settings.tp, cnss: settings.cnss,
    };
    setBlPreview([{
      numero: bl.numero, delivery_date: bl.delivery_date,
      client: { nom: bl.client_nom, ice: client?.ice ?? null, adresse_livraison: client?.adresse_livraison ?? null, code: client?.code ?? null },
      items: bl.items ?? [], logoUrl: settings.logo_url, company: co,
    }]);
  }

  const formTotalHTBrut = formItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const formTotalRemise = formItems.reduce((s, i) => s + (i.remise || 0), 0);
  const formTotalHTNet = formTotalHTBrut - formTotalRemise;
  const formTotalTVA = formItems.reduce((s, i) => s + (i.quantity * i.unit_price - (i.remise || 0)) * (i.vat_rate / 100), 0);
  const formTotalTTC = formTotalHTNet + formTotalTVA;
  const formTotalHT = formTotalHTNet; // alias for save payload

  return (
    <div className="space-y-4">

      {/* Barre d'outils principale */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-gray-400 text-sm">{filtered.length} / {bls.length} BL</p>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
          <Plus size={16} />
          Nouveau BL
        </button>
      </div>

      {/* Barre actions groupées */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
          <span className="text-sm font-semibold text-gray-700 mr-1">
            {selected.size} élément{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''} :
          </span>

          {/* Changer l'état */}
          <div className="relative">
            <button onClick={() => setEtatDropdownOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors">
              Changer l&apos;état
              <ChevronDown size={13} />
            </button>
            {etatDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[130px]">
                {[
                  { v: 'brouillon', label: 'Brouillon' },
                  { v: 'emis', label: 'Émis' },
                  { v: 'facture', label: 'Facturé' },
                ].map(s => (
                  <button key={s.v} onClick={() => handleBulkChangerEtat(s.v)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Télécharger PDF */}
          <button onClick={() => {
            filtered.filter(b => selected.has(b.id)).forEach(bl => openPreview(bl));
          }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg transition-colors">
            <Printer size={13} />
            Télécharger PDF
          </button>

          {/* Facturer la sélection */}
          <button onClick={() => { setBulkFactureClientId(''); setBulkFactureModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors">
            <Receipt size={13} />
            Facturer la sélection
          </button>

          {/* Supprimer */}
          <button onClick={handleBulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
            <Trash2 size={13} />
            {bulkDeleting ? 'Suppression…' : 'Supprimer'}
          </button>

          <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-400 hover:text-gray-600 p-1">
            <X size={15} />
          </button>
        </div>
      )}

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
                <tr className="border-b border-gray-100">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 cursor-pointer" />
                  </th>
                  <SortHeader label="Numéro" field="numero" sort={sort} onSort={handleSort} />
                  <SortHeader label="Client" field="client_nom" sort={sort} onSort={handleSort} />
                  <SortHeader label="Total HT" field="total_ht" sort={sort} onSort={handleSort} />
                  <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Statut</th>
                  <SortHeader label="Date de livraison" field="delivery_date" sort={sort} onSort={handleSort} />
                  <th className="px-3 py-3 text-right">
                    <button onClick={() => setFiltersVisible(v => !v)}
                      className={`p-1.5 rounded-lg transition-colors ${filtersVisible ? 'bg-teal-50 text-teal-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'}`}>
                      <Search size={14} />
                    </button>
                  </th>
                </tr>

                {filtersVisible && (
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <td className="pl-4 pr-2 py-2" />
                    <td className="px-3 py-2">
                      <input value={fNumero} onChange={e => setFNumero(e.target.value)} placeholder="…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={fClient} onChange={e => setFClient(e.target.value)} placeholder="…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      <select value={fStatut} onChange={e => setFStatut(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                        <option value="">Tous</option>
                        <option value="brouillon">Brouillon</option>
                        <option value="emis">Émis</option>
                        <option value="facture">Facturé</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <input type="date" value={fDateDu} onChange={e => setFDateDu(e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                        <input type="date" value={fDateAu} onChange={e => setFDateAu(e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
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
                      <Truck size={32} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">Aucun bon de livraison</p>
                    </td>
                  </tr>
                ) : filtered.map(bl => (
                  <tr key={bl.id}
                    onClick={() => setDetailBL(bl)}
                    className={`hover:bg-gray-50/50 transition-colors group cursor-pointer ${selected.has(bl.id) ? 'bg-teal-50/40' : ''}`}>
                    <td className="pl-4 pr-2 py-3 w-8" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selected.has(bl.id)}
                        onChange={() => toggleSelect(bl.id)}
                        className="w-4 h-4 rounded border-gray-300 text-teal-600 cursor-pointer" />
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold text-gray-900 text-sm">{bl.numero}</span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">{bl.client_nom}</td>
                    <td className="px-3 py-3">
                      <span className="font-black text-gray-900 text-sm">{formatPrice(bl._totalHT)}</span>
                      <div className="text-xs text-gray-400">{bl.items?.length ?? 0} article{(bl.items?.length ?? 0) !== 1 ? 's' : ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const s = STATUTS_BL[bl.statut] ?? STATUTS_BL.brouillon;
                        return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${s.color} ${s.bg}`}>{s.label}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500">{formatDate(bl.delivery_date)}</td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openPreview(bl)} title="Aperçu PDF"
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                          <Printer size={14} />
                        </button>
                        {(bl.statut === 'brouillon' || !bl.statut) && (
                          <>
                            <button onClick={() => openEdit(bl)} title="Modifier"
                              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleEmettre(bl)}
                              className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold">
                              Émettre
                            </button>
                            <button onClick={() => handleDelete(bl)} title="Supprimer"
                              className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {bl.statut === 'emis' && (
                          <>
                            <button onClick={() => openEdit(bl)} title="Modifier"
                              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => {
                              const found = clients.find(c => c.nom.toLowerCase() === bl.client_nom.toLowerCase());
                              setFactureDirectClientId(found?.id ?? '');
                              setFactureDirectBL(bl);
                            }}
                              className="px-2 py-1 bg-teal-50 text-teal-600 hover:bg-teal-100 rounded-lg text-xs font-semibold">
                              Facturer
                            </button>
                            <button onClick={() => handleDelete(bl)} title="Supprimer"
                              className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {bl.statut === 'facture' && (
                          <button onClick={() => openEdit(bl)} title="Modifier"
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                            <Pencil size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aperçu PDF A4 */}
      {blPreview && (
        <BLModal orders={blPreview} title={blPreview[0]?.numero} onClose={() => setBlPreview(null)} />
      )}

      {/* Panneau détail */}
      {detailBL && (
        <BLDetailPanel
          bl={detailBL}
          clients={clients}
          onClose={() => setDetailBL(null)}
          onEdit={bl => { setDetailBL(null); openEdit(bl); }}
          onDelete={async bl => { await handleDelete(bl); setDetailBL(null); }}
          onEmettre={async bl => {
            await supabase.from('bons_livraison').update({ statut: 'emis' }).eq('id', bl.id);
            load();
            setDetailBL({ ...bl, statut: 'emis' });
          }}
          onFacture={() => load()}
        />
      )}

      {/* Modal création / édition */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing ? 'Modifier le BL' : 'Nouveau bon de livraison'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                  <select value={formClientId} onChange={e => handleClientChange(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Sélectionner un client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  {!formClientId && (
                    <input value={formClientNom} onChange={e => setFormClientNom(e.target.value)}
                      placeholder="Ou saisir un nom libre…"
                      className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date d'émission</label>
                  <input type="date" value={formDate} onChange={e => {
                    setFormDate(e.target.value);
                    setFormEcheance(finDuMois(e.target.value));
                  }}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Statut */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</label>
                <select value={formStatut} onChange={e => setFormStatut(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="brouillon">Brouillon</option>
                  <option value="emis">Émis</option>
                  <option value="facture">Facturé</option>
                </select>
              </div>

              {/* Échéance + mode paiement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Échéance</label>
                  <div className="mt-1 flex gap-2">
                    <button type="button"
                      onClick={() => setFormEcheance(finDuMois(formDate))}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${formEcheance === finDuMois(formDate) ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      Fin du mois
                    </button>
                    <input type="date" value={formEcheance} onChange={e => setFormEcheance(e.target.value)}
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

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Articles</label>
                <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                    <div className="col-span-4">Désignation</div>
                    <div className="col-span-1 text-center">Qté</div>
                    <div className="col-span-2 text-right">P.U. HT</div>
                    <div className="col-span-1 text-center">TVA %</div>
                    <div className="col-span-2 text-right">Réduc. HT</div>
                    <div className="col-span-2 text-right">Total HT</div>
                  </div>
                  {formItems.map((item, idx) => {
                    const totalLigne = item.quantity * item.unit_price - (item.remise || 0);
                    return (
                    <div key={idx} className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-gray-100 items-center">
                      <div className="col-span-4">
                        <input
                          value={item.display_name}
                          onChange={e => { updateItem(idx, 'display_name', e.target.value); setActiveDropdown(idx); }}
                          onFocus={() => setActiveDropdown(idx)}
                          onBlur={() => setTimeout(() => setActiveDropdown(null), 150)}
                          placeholder="Désignation ou article catalogue…"
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-1">
                        <input type="number" min="0" step="0.001" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full text-sm text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.01" value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full text-sm text-right border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="col-span-1">
                        <select value={item.vat_rate} onChange={e => updateItem(idx, 'vat_rate', parseFloat(e.target.value))}
                          className="w-full text-xs text-center border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
                          {TVA_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" step="0.01" value={item.remise || 0}
                          onChange={e => updateItem(idx, 'remise', parseFloat(e.target.value) || 0)}
                          className="w-full text-sm text-right border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-xs font-semibold text-gray-700">{formatPrice(totalLigne)}</span>
                        <button onClick={() => setFormItems(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-400 shrink-0">
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
                {activeDropdown !== null && (() => {
                  const idx = activeDropdown;
                  const item = formItems[idx];
                  const suggestions = articles.filter(a =>
                    !item?.display_name ||
                    a.display_name.toLowerCase().includes(item.display_name.toLowerCase())
                  );
                  if (!suggestions.length) return null;
                  return (
                    <div className="mt-1 border border-gray-200 rounded-xl shadow-md bg-white max-h-48 overflow-y-auto">
                      {suggestions.map(a => (
                        <button key={a.id} type="button"
                          onMouseDown={() => applyArticle(idx, a.id)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
                          <span>{a.display_name}</span>
                          <span className="text-xs text-gray-400 shrink-0">{formatPrice(a.custom_price ?? a.prix_pro ?? 0)}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <button onClick={() => setFormItems(prev => [...prev, { ...EMPTY_ITEM }])}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
                  <Plus size={12} /> Ajouter une ligne
                </button>
              </div>

              <div className="flex justify-end">
                <div className="w-72 border border-gray-100 rounded-xl overflow-hidden text-sm">
                  <div className="flex justify-between px-4 py-2 bg-gray-50">
                    <span className="text-gray-500">Total HT brut</span>
                    <span className="font-semibold text-gray-800">{formatPrice(formTotalHTBrut)}</span>
                  </div>
                  {formTotalRemise > 0 && (
                    <div className="flex justify-between px-4 py-2 border-t border-gray-100">
                      <span className="text-gray-500">Total réductions HT</span>
                      <span className="font-semibold text-red-500">− {formatPrice(formTotalRemise)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-2 border-t border-gray-100">
                    <span className="text-gray-500">Total TVA</span>
                    <span className="font-semibold text-gray-800">{formatPrice(formTotalTVA)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 border-t-2 border-gray-200 bg-gray-50">
                    <span className="font-bold text-gray-900">Total TTC</span>
                    <span className="font-black text-teal-700">{formatPrice(formTotalTTC)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSave}
                disabled={saving || !formClientNom.trim() || formItems.some(i => !i.display_name)}
                className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le BL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale facturation directe */}
      {factureDirectBL && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Facturer {factureDirectBL.numero}</h2>
              <button onClick={() => setFactureDirectBL(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                <select value={factureDirectClientId} onChange={e => setFactureDirectClientId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600 space-y-1">
                {(factureDirectBL.items ?? []).map((i, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{i.display_name} × {i.quantity}</span>
                    <span className="font-semibold">{formatPrice(i.quantity * i.unit_price)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setFactureDirectBL(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={handleFactureDirect} disabled={facturingDirect || !factureDirectClientId}
                  className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors">
                  {facturingDirect ? 'Facturation…' : 'Créer la facture'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale facturation groupée */}
      {bulkFactureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Facturer la sélection</h2>
              <button onClick={() => setBulkFactureModal(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-500">
                {selected.size} BL sélectionné{selected.size > 1 ? 's' : ''} — une facture sera créée par BL.
              </p>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client *</label>
                <select value={bulkFactureClientId} onChange={e => setBulkFactureClientId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">— Sélectionner un client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setBulkFactureModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={handleBulkFacturer} disabled={bulkFacturing || !bulkFactureClientId}
                  className="px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {bulkFacturing ? 'Facturation…' : 'Facturer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
