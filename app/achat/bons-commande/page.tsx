'use client';

import { useEffect, useState, useMemo } from 'react';
import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, X, AlertTriangle, ChevronDown, ChevronUp,
  Truck, FileText, Package, Mail, MessageCircle,
  CheckCircle, RotateCcw, ArrowLeftRight, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier { id: string; nom: string; email: string | null; telephone: string | null; adresse?: string | null; ice?: string | null; }

interface StockItem {
  id: string; nom: string; unite: string;
  stock_actuel: number; stock_min: number;
  supplier_id: string | null; prix_moyen_pondere: number;
}

interface BDCLine {
  id?: string; stock_item_id: string;
  quantite_commandee: number; quantite_recue: number | null;
  prix_unitaire: number;
  stock_item?: { nom: string; unite: string };
}

interface BDC {
  id: string; supplier_id: string; date: string;
  statut: 'en_attente' | 'recu_partiel' | 'recu_complet';
  note: string | null; total: number;
  supplier?: Supplier; lines?: BDCLine[];
}

interface SupplierReturn {
  id: string;
  order_id: string;
  supplier_id: string;
  date: string;
  raison: string;
  note: string | null;
  total: number;
  lines?: { id: string; stock_item_id: string; quantite: number; prix_unitaire: number; stock_item?: { nom: string; unite: string } }[];
}

interface ReturnLineForm {
  stock_item_id: string;
  nom: string;
  unite: string;
  quantite: number;
  prix_unitaire: number;
  max_qty: number;
}

interface BDCSnapshot {
  supplier: Supplier;
  date: string;
  note: string;
  total: number;
  lines: { nom: string; unite: string; quantite_commandee: number; prix_unitaire: number }[];
}

interface ReturnSnapshot {
  supplier: Supplier;
  bdcDate: string;
  date: string;
  raison: string;
  note: string;
  total: number;
  lines: { nom: string; unite: string; quantite: number; prix_unitaire: number }[];
}

type TabFilter = 'all' | 'en_attente';

const ST: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  en_attente:   { label: 'En attente',   bg: 'bg-orange-50',  color: 'text-orange-700', dot: 'bg-orange-400' },
  recu_partiel: { label: 'Reçu partiel', bg: 'bg-blue-50',    color: 'text-blue-700',   dot: 'bg-blue-400' },
  recu_complet: { label: 'Reçu complet', bg: 'bg-green-50',   color: 'text-green-700',  dot: 'bg-green-400' },
};

const RAISONS = [
  'Qualité non conforme',
  'Produit endommagé',
  'Produit périmé',
  'Erreur de livraison',
  'Surstock',
  'Autre',
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtPrice(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function generateBDCText(snap: BDCSnapshot): string {
  const date = new Date(snap.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const lines = snap.lines.map(l => `• ${l.nom} : ${l.quantite_commandee} ${l.unite} × ${l.prix_unitaire.toFixed(2)} MAD`).join('\n');
  const note = snap.note ? `\nNote : ${snap.note}` : '';
  return `Bon de commande — ${date}\n\n${lines}\n\nTotal : ${snap.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD${note}`;
}

function generateReturnText(snap: ReturnSnapshot): string {
  const date = new Date(snap.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const bdcDate = new Date(snap.bdcDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const lines = snap.lines.map(l => `• ${l.nom} : ${l.quantite} ${l.unite} × ${l.prix_unitaire.toFixed(2)} MAD`).join('\n');
  const note = snap.note ? `\nNote : ${snap.note}` : '';
  return `Retour fournisseur — ${date}\nCommande du ${bdcDate}\nMotif : ${snap.raison}\n\nArticles retournés :\n${lines}\n\nTotal à déduire : ${snap.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD${note}`;
}

function SendButtons({ supplier, message, subject = 'Bon de commande' }: { supplier: Supplier; message: string; subject?: string }) {
  const phone   = supplier.telephone?.replace(/\D/g, '') ?? '';
  const waUrl   = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;
  const mailUrl = supplier.email
    ? `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    : null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {waUrl ? (
        <a href={waUrl} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors">
          <MessageCircle size={14} /> WhatsApp
        </a>
      ) : (
        <span className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-400 rounded-xl text-sm cursor-not-allowed" title="Téléphone non renseigné">
          <MessageCircle size={14} /> WhatsApp
        </span>
      )}
      {mailUrl ? (
        <a href={mailUrl}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          <Mail size={14} /> Email
        </a>
      ) : (
        <span className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-400 rounded-xl text-sm cursor-not-allowed" title="Email non renseigné">
          <Mail size={14} /> Email
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BonsCommandePage() {
  const router = useRouter();
  const [bons, setBons]           = useState<BDC[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems]         = useState<StockItem[]>([]);
  const [loading, setLoading]     = useState(true);

  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [tabFilter, setTabFilter]     = useState<TabFilter>('all');
  const [alertOpen, setAlertOpen]     = useState(false);

  // Formulaire BDC
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [fSupplierId, setFSupplierId] = useState('');
  const [fDate, setFDate]             = useState(new Date().toISOString().slice(0, 10));
  const [fNote, setFNote]             = useState('');
  const [fLines, setFLines]           = useState<{ stock_item_id: string; quantite_commandee: number; prix_unitaire: number }[]>([]);

  // Post-création
  const [bdcSnapshot, setBdcSnapshot] = useState<BDCSnapshot | null>(null);

  // Réception
  const [receivingBdc, setReceivingBdc]   = useState<BDC | null>(null);
  const [receivedQtys, setReceivedQtys]   = useState<Record<string, number>>({});

  // Retours
  const [returnModal, setReturnModal]     = useState<BDC | null>(null);
  const [returnDate, setReturnDate]       = useState(new Date().toISOString().slice(0, 10));
  const [returnRaison, setReturnRaison]   = useState(RAISONS[0]);
  const [returnNote, setReturnNote]       = useState('');
  const [returnLines, setReturnLines]     = useState<ReturnLineForm[]>([]);
  const [savingReturn, setSavingReturn]   = useState(false);
  const [returnsForBdc, setReturnsForBdc] = useState<Record<string, SupplierReturn[]>>({});
  const [returnSnapshot, setReturnSnapshot] = useState<ReturnSnapshot | null>(null);

  useEffect(() => { load(); }, []);

  // Charger les retours quand un BDC reçu est ouvert
  useEffect(() => {
    if (!expandedId) return;
    const bdc = bons.find(b => b.id === expandedId);
    if (bdc && bdc.statut !== 'en_attente' && !(expandedId in returnsForBdc)) {
      loadReturns(expandedId);
    }
  }, [expandedId, bons]);

  async function load() {
    const [{ data: b }, { data: s }, { data: i }] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, supplier:suppliers(nom, email, telephone, ice), lines:purchase_order_lines(*, stock_item:stock_items(nom, unite))')
        .order('date', { ascending: false }),
      supabase.from('suppliers').select('id, nom, email, telephone').order('nom'),
      supabase.from('stock_items').select('*').not('item_type', 'eq', 'pf').order('nom'),
    ]);
    setBons((b as BDC[]) || []);
    setSuppliers((s as Supplier[]) || []);
    setItems((i as StockItem[]) || []);
    setLoading(false);
  }

  async function loadReturns(bdcId: string) {
    const { data } = await supabase
      .from('supplier_returns')
      .select('*, lines:supplier_return_lines(*, stock_item:stock_items(nom, unite))')
      .eq('order_id', bdcId)
      .order('date', { ascending: false });
    setReturnsForBdc(p => ({ ...p, [bdcId]: (data as SupplierReturn[]) || [] }));
  }

  // ── Alertes ────────────────────────────────────────────────────────────────

  const alertItems = useMemo(() => items.filter(i => i.stock_min > 0 && i.stock_actuel <= i.stock_min), [items]);

  const alertBySupplier = useMemo(() => {
    const map: Record<string, { supplier: Supplier | null; items: StockItem[] }> = {};
    for (const item of alertItems) {
      const key = item.supplier_id ?? '__none__';
      if (!map[key]) map[key] = { supplier: suppliers.find(s => s.id === item.supplier_id) ?? null, items: [] };
      map[key].items.push(item);
    }
    return Object.values(map).sort((a, b) => b.items.length - a.items.length);
  }, [alertItems, suppliers]);

  const displayed = useMemo(() =>
    tabFilter === 'en_attente' ? bons.filter(b => b.statut === 'en_attente') : bons,
    [bons, tabFilter]
  );

  const pendingCount = useMemo(() => bons.filter(b => b.statut === 'en_attente').length, [bons]);

  // ── Formulaire BDC ─────────────────────────────────────────────────────────

  const orderedItems = fSupplierId
    ? [...items.filter(i => i.supplier_id === fSupplierId), ...items.filter(i => i.supplier_id !== fSupplierId)]
    : items;

  function openFormForSupplier(supplierId: string) {
    setFSupplierId(supplierId);
    const alerts = items.filter(i => i.supplier_id === supplierId && i.stock_min > 0 && i.stock_actuel <= i.stock_min);
    setFLines(alerts.map(i => ({ stock_item_id: i.id, quantite_commandee: Math.max(i.stock_min - i.stock_actuel, 1), prix_unitaire: i.prix_moyen_pondere || 0 })));
    setAlertOpen(false);
    setShowForm(true);
  }

  function handleSupplierChange(id: string) {
    setFSupplierId(id);
    const alerts = items.filter(i => i.supplier_id === id && i.stock_min > 0 && i.stock_actuel <= i.stock_min);
    setFLines(alerts.map(i => ({ stock_item_id: i.id, quantite_commandee: Math.max(i.stock_min - i.stock_actuel, 1), prix_unitaire: i.prix_moyen_pondere || 0 })));
  }

  function handleLineItem(idx: number, itemId: string) {
    const item = items.find(i => i.id === itemId);
    setFLines(p => p.map((l, i) => i === idx ? { ...l, stock_item_id: itemId, prix_unitaire: item?.prix_moyen_pondere || 0 } : l));
  }

  function updateLine(idx: number, k: string, v: any) {
    setFLines(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l));
  }

  const fTotal = fLines.reduce((s, l) => s + l.quantite_commandee * l.prix_unitaire, 0);

  async function saveBDC() {
    if (!fSupplierId || !fLines.length || fLines.some(l => !l.stock_item_id)) return;
    setSaving(true);
    const sup = suppliers.find(s => s.id === fSupplierId)!;
    const snapshot: BDCSnapshot = {
      supplier: sup, date: fDate, note: fNote, total: fTotal,
      lines: fLines.map(l => {
        const item = items.find(i => i.id === l.stock_item_id);
        return { nom: item?.nom ?? '—', unite: item?.unite ?? '', quantite_commandee: l.quantite_commandee, prix_unitaire: l.prix_unitaire };
      }),
    };
    const { data: bdc } = await supabase.from('purchase_orders').insert({
      supplier_id: fSupplierId, date: fDate, statut: 'en_attente', note: fNote || null, total: fTotal,
    }).select().single();
    if (bdc) {
      await supabase.from('purchase_order_lines').insert(fLines.map(l => ({ ...l, order_id: bdc.id })));
      resetForm();
      setBdcSnapshot(snapshot);
      load();
    }
    setSaving(false);
  }

  function resetForm() {
    setShowForm(false); setFSupplierId(''); setFNote(''); setFLines([]);
    setFDate(new Date().toISOString().slice(0, 10));
  }

  // ── Réception ──────────────────────────────────────────────────────────────

  function startReceiving(bdc: BDC) {
    setReceivingBdc(bdc);
    const qtys: Record<string, number> = {};
    (bdc.lines || []).forEach(l => { if (l.id) qtys[l.id] = l.quantite_commandee; });
    setReceivedQtys(qtys);
  }

  // Entrée en stock + création facture brouillon liée au BDC
  async function doReceiveLines(bdc: BDC, qtys: Record<string, number>) {
    const lines = bdc.lines || [];
    // 1. Sauvegarder quantites_recues
    for (const line of lines) {
      if (!line.id) continue;
      await supabase.from('purchase_order_lines').update({ quantite_recue: qtys[line.id] ?? line.quantite_commandee }).eq('id', line.id);
    }
    // 2. Entrée immédiate en stock
    for (const line of lines) {
      if (!line.id) continue;
      const qty = qtys[line.id] ?? line.quantite_commandee;
      if (qty <= 0) continue;
      const { data: item } = await supabase.from('stock_items').select('stock_actuel, prix_moyen_pondere').eq('id', line.stock_item_id).single();
      if (!item) continue;
      const newQty = (item.stock_actuel || 0) + qty;
      const newPmp = newQty > 0 ? ((item.stock_actuel || 0) * (item.prix_moyen_pondere || 0) + qty * line.prix_unitaire) / newQty : line.prix_unitaire;
      await supabase.from('stock_items').update({ stock_actuel: newQty, prix_moyen_pondere: newPmp }).eq('id', line.stock_item_id);
      await supabase.from('stock_movements').insert({
        stock_item_id: line.stock_item_id, type: 'entree_bdc',
        quantite: qty, prix_unitaire: line.prix_unitaire,
        reference_id: bdc.id, reference_type: 'purchase_order',
        date: bdc.date, note: `Réception BDC — ${bdc.supplier?.nom || ''}`, utilisateur: 'Réception',
      });
    }
    // 3. Créer facture brouillon liée au BDC
    const invoiceTotal = lines.reduce((s, l) => {
      const qty = l.id ? (qtys[l.id] ?? l.quantite_commandee) : l.quantite_commandee;
      return s + qty * l.prix_unitaire;
    }, 0);
    const { data: inv } = await supabase.from('supplier_invoices').insert({
      supplier_id: bdc.supplier_id, numero: null,
      date_facture: new Date().toISOString().slice(0, 10),
      statut: 'brouillon', total: invoiceTotal, order_id: bdc.id,
    }).select().single();
    if (inv) {
      await supabase.from('supplier_invoice_lines').insert(
        lines.map(l => ({
          invoice_id: inv.id, stock_item_id: l.stock_item_id,
          quantite: l.id ? (qtys[l.id] ?? l.quantite_commandee) : l.quantite_commandee,
          prix_unitaire: l.prix_unitaire,
        }))
      );
    }
  }

  async function confirmReceive(complete: boolean) {
    if (!receivingBdc) return;
    setSaving(true);
    await supabase.from('purchase_orders').update({ statut: complete ? 'recu_complet' : 'recu_partiel' }).eq('id', receivingBdc.id);
    await doReceiveLines(receivingBdc, receivedQtys);
    setReceivingBdc(null); setReceivedQtys({}); setSaving(false); load();
  }

  async function confirmReceiveAndReturn() {
    if (!receivingBdc) return;
    setSaving(true);
    await supabase.from('purchase_orders').update({ statut: 'recu_partiel' }).eq('id', receivingBdc.id);
    await doReceiveLines(receivingBdc, receivedQtys);
    const bdcForReturn = { ...receivingBdc, statut: 'recu_partiel' as const };
    const prefilled: ReturnLineForm[] = (receivingBdc.lines || []).map(l => ({
      stock_item_id: l.stock_item_id,
      nom: l.stock_item?.nom ?? '—',
      unite: l.stock_item?.unite ?? '',
      quantite: l.id ? (receivedQtys[l.id] ?? l.quantite_commandee) : l.quantite_commandee,
      prix_unitaire: l.prix_unitaire,
      max_qty: l.id ? (receivedQtys[l.id] ?? l.quantite_commandee) : l.quantite_commandee,
    }));
    setReceivingBdc(null); setReceivedQtys({}); setSaving(false);
    setReturnModal(bdcForReturn);
    setReturnDate(new Date().toISOString().slice(0, 10));
    setReturnRaison(RAISONS[0]);
    setReturnNote('');
    setReturnLines(prefilled);
    load();
  }

  // ── Retours ────────────────────────────────────────────────────────────────

  function openReturnModal(bdc: BDC) {
    setReturnModal(bdc);
    setReturnDate(new Date().toISOString().slice(0, 10));
    setReturnRaison(RAISONS[0]);
    setReturnNote('');
    const receivedLines: ReturnLineForm[] = (bdc.lines || [])
      .filter(l => (l.quantite_recue ?? l.quantite_commandee) > 0)
      .map(l => ({
        stock_item_id: l.stock_item_id,
        nom: l.stock_item?.nom ?? '—',
        unite: l.stock_item?.unite ?? '',
        quantite: 0,
        prix_unitaire: l.prix_unitaire,
        max_qty: l.quantite_recue ?? l.quantite_commandee,
      }));
    setReturnLines(receivedLines);
  }

  async function saveReturn() {
    if (!returnModal) return;
    const toReturn = returnLines.filter(l => l.quantite > 0);
    if (!toReturn.length) return;
    setSavingReturn(true);
    const total = toReturn.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

    const { data: ret } = await supabase.from('supplier_returns').insert({
      order_id: returnModal.id,
      supplier_id: returnModal.supplier_id,
      date: returnDate,
      raison: returnRaison,
      note: returnNote || null,
      total,
    }).select().single();

    if (ret) {
      await supabase.from('supplier_return_lines').insert(
        toReturn.map(l => ({ return_id: ret.id, stock_item_id: l.stock_item_id, quantite: l.quantite, prix_unitaire: l.prix_unitaire }))
      );

      for (const l of toReturn) {
        // Décrémenter stock_actuel
        const { data: item } = await supabase.from('stock_items').select('stock_actuel').eq('id', l.stock_item_id).single();
        if (item) {
          await supabase.from('stock_items').update({ stock_actuel: Math.max(0, (item.stock_actuel || 0) - l.quantite) }).eq('id', l.stock_item_id);
        }
        await supabase.from('stock_movements').insert({
          stock_item_id: l.stock_item_id,
          type: 'retour_fournisseur',
          quantite: -l.quantite,
          prix_unitaire: l.prix_unitaire,
          date: returnDate,
          note: `Retour fournisseur — ${returnRaison}${returnNote ? ` — ${returnNote}` : ''}`,
          utilisateur: 'Retour',
        });
      }

      setReturnSnapshot({
        supplier: returnModal.supplier!,
        bdcDate: returnModal.date,
        date: returnDate,
        raison: returnRaison,
        note: returnNote,
        total,
        lines: toReturn.map(l => ({ nom: l.nom, unite: l.unite, quantite: l.quantite, prix_unitaire: l.prix_unitaire })),
      });

      loadReturns(returnModal.id);
      setReturnModal(null);
    }
    setSavingReturn(false);
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Bons de commande</h2>
          <p className="text-sm text-gray-400">
            {pendingCount > 0
              ? <span className="text-orange-600 font-medium">{pendingCount} en attente</span>
              : 'Aucun BDC en attente'}
            {alertItems.length > 0 && <span className="text-gray-400"> · {alertItems.length} article{alertItems.length > 1 ? 's' : ''} à réapprovisionner</span>}
          </p>
        </div>
        <button onClick={() => { resetForm(); setBdcSnapshot(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
          <Plus size={15} /> Nouveau BDC
        </button>
      </div>

      {/* Carte envoi post-création */}
      {bdcSnapshot && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-green-600" />
              <div>
                <p className="font-bold text-gray-900">BDC créé — {bdcSnapshot.supplier.nom}</p>
                <p className="text-xs text-gray-400">{fmtDate(bdcSnapshot.date)} · {bdcSnapshot.lines.length} article{bdcSnapshot.lines.length > 1 ? 's' : ''} · {fmtPrice(bdcSnapshot.total)}</p>
              </div>
            </div>
            <button onClick={() => setBdcSnapshot(null)}><X size={18} className="text-gray-400" /></button>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-gray-600 font-medium">Envoyer la commande :</p>
            <SendButtons supplier={bdcSnapshot.supplier} message={generateBDCText(bdcSnapshot)} />
          </div>
        </div>
      )}

      {/* Carte envoi post-retour */}
      {returnSnapshot && (
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-orange-500" />
              <div>
                <p className="font-bold text-gray-900">Retour enregistré — {returnSnapshot.supplier.nom}</p>
                <p className="text-xs text-gray-400">{returnSnapshot.raison} · {fmtPrice(returnSnapshot.total)}</p>
              </div>
            </div>
            <button onClick={() => setReturnSnapshot(null)}><X size={18} className="text-gray-400" /></button>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-gray-600 font-medium">Notifier le fournisseur :</p>
            <SendButtons supplier={returnSnapshot.supplier} message={generateReturnText(returnSnapshot)} subject="Retour fournisseur" />
          </div>
        </div>
      )}

      {/* Bandeau alertes */}
      {alertItems.length > 0 && !showForm && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl overflow-hidden">
          <button onClick={() => setAlertOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-orange-600 shrink-0" />
              <span className="text-sm font-semibold text-orange-800">{alertItems.length} article{alertItems.length > 1 ? 's' : ''} à réapprovisionner</span>
              <span className="text-xs text-orange-500">chez {alertBySupplier.length} fournisseur{alertBySupplier.length > 1 ? 's' : ''}</span>
            </div>
            {alertOpen ? <ChevronUp size={15} className="text-orange-500 shrink-0" /> : <ChevronDown size={15} className="text-orange-500 shrink-0" />}
          </button>
          {alertOpen && (
            <div className="border-t border-orange-200 divide-y divide-orange-100">
              {alertBySupplier.map((group, gi) => (
                <div key={gi} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-gray-800">{group.supplier?.nom ?? 'Sans fournisseur'}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-semibold">{group.items.length} article{group.items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.slice(0, 6).map(i => (
                        <span key={i.id} className="text-xs px-2 py-0.5 bg-white border border-orange-200 text-orange-700 rounded-lg">
                          {i.nom}
                          {i.stock_actuel <= 0 ? <span className="ml-1 text-red-500 font-bold">0</span> : <span className="ml-1 text-orange-500">{i.stock_actuel}/{i.stock_min}</span>}
                          <span className="text-orange-400"> {i.unite}</span>
                        </span>
                      ))}
                      {group.items.length > 6 && <span className="text-xs text-orange-400 self-center">+{group.items.length - 6} autres</span>}
                    </div>
                  </div>
                  {group.supplier && (
                    <button onClick={() => openFormForSupplier(group.supplier!.id)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 transition-colors">
                      <Plus size={11} /> Commander
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Formulaire nouveau BDC */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="font-bold text-gray-900">Nouveau bon de commande</p>
            <button onClick={resetForm}><X size={18} className="text-gray-400" /></button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select value={fSupplierId} onChange={e => handleSupplierChange(e.target.value)}
                className="sm:col-span-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Fournisseur *</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Note (optionnel)"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {fSupplierId && items.filter(i => i.supplier_id === fSupplierId && i.stock_min > 0 && i.stock_actuel <= i.stock_min).length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-100 rounded-xl">
                <AlertTriangle size={13} className="text-orange-500 shrink-0" />
                <p className="text-xs text-orange-700 font-medium">
                  {items.filter(i => i.supplier_id === fSupplierId && i.stock_min > 0 && i.stock_actuel <= i.stock_min).length} articles en alerte pré-ajoutés
                </p>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Articles à commander</p>
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                {fLines.length > 0 && (
                  <div className="grid grid-cols-12 px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    <div className="col-span-5">Article</div>
                    <div className="col-span-3 text-center">Quantité</div>
                    <div className="col-span-3 text-center">Prix unit. (MAD)</div>
                    <div className="col-span-1" />
                  </div>
                )}
                {fLines.map((line, idx) => {
                  const selectedItem = items.find(i => i.id === line.stock_item_id);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-gray-100 last:border-0">
                      <select value={line.stock_item_id} onChange={e => handleLineItem(idx, e.target.value)}
                        className="col-span-5 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">— Article</option>
                        {orderedItems.map(i => (
                          <option key={i.id} value={i.id}>{i.supplier_id === fSupplierId ? '★ ' : ''}{i.nom} ({i.unite})</option>
                        ))}
                      </select>
                      <div className="col-span-3 flex items-center gap-1">
                        <input type="number" min={0} step={0.1} value={line.quantite_commandee}
                          onChange={e => updateLine(idx, 'quantite_commandee', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {selectedItem && <span className="text-xs text-gray-400 shrink-0">{selectedItem.unite}</span>}
                      </div>
                      <input type="number" min={0} step={0.01} value={line.prix_unitaire}
                        onChange={e => updateLine(idx, 'prix_unitaire', parseFloat(e.target.value) || 0)}
                        className="col-span-3 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={() => setFLines(p => p.filter((_, i) => i !== idx))}
                        className="col-span-1 flex justify-center p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                <button onClick={() => setFLines(p => [...p, { stock_item_id: '', quantite_commandee: 1, prix_unitaire: 0 }])}
                  className="w-full py-2.5 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50 flex items-center justify-center gap-1.5 transition-colors">
                  <Plus size={12} /> Ajouter un article
                </button>
              </div>
            </div>
            {fLines.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl">
                <span className="text-sm font-semibold text-blue-700">Total estimé</span>
                <span className="text-lg font-black text-blue-700">{fmtPrice(fTotal)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
            <button onClick={resetForm} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
            <button onClick={saveBDC} disabled={saving || !fSupplierId || !fLines.length || fLines.some(l => !l.stock_item_id)}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors">
              {saving ? 'Création…' : 'Créer le BDC'}
            </button>
          </div>
        </div>
      )}

      {/* Liste des BDC */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : bons.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun bon de commande</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
            {([['all', `Tous (${bons.length})`], ['en_attente', `En attente (${pendingCount})`]] as [TabFilter, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setTabFilter(val)}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${tabFilter === val ? (val === 'en_attente' ? 'bg-orange-500 text-white' : 'bg-gray-900 text-white') : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">Aucun BDC dans ce filtre</div>
          ) : (
            <>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fournisseur</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Articles</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
                      <th className="px-4 py-2.5 w-32" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayed.map(bdc => {
                      const st = ST[bdc.statut];
                      const open = expandedId === bdc.id;
                      const bdcReturns = returnsForBdc[bdc.id] || [];
                      const bdcMsg = bdc.supplier ? generateBDCText({
                        supplier: bdc.supplier, date: bdc.date, note: bdc.note ?? '', total: bdc.total,
                        lines: (bdc.lines || []).map(l => ({ nom: l.stock_item?.nom ?? '—', unite: l.stock_item?.unite ?? '', quantite_commandee: l.quantite_commandee, prix_unitaire: l.prix_unitaire })),
                      }) : '';

                      return (
                        <Fragment key={bdc.id}>
                          <tr onClick={() => setExpandedId(open ? null : bdc.id)}
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer group">
                            <td className="px-5 py-3">
                              <p className="font-semibold text-gray-900">{bdc.supplier?.nom}</p>
                              {bdc.note && <p className="text-xs text-gray-400 italic mt-0.5">"{bdc.note}"</p>}
                            </td>
                            <td className="px-4 py-3 text-gray-500 tabular-nums">{fmtDate(bdc.date)}</td>
                            <td className="px-4 py-3 text-center text-gray-500">{(bdc.lines || []).length}</td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">{fmtPrice(bdc.total)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold ${st.bg} ${st.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => router.push(`/achat/bons-commande/${bdc.id}`)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors">
                                  <ExternalLink size={11} /> Voir BDC
                                </button>
                                {bdc.statut === 'en_attente' && (
                                  <button onClick={() => startReceiving(bdc)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">
                                    <Truck size={11} /> Réceptionner
                                  </button>
                                )}
                                {bdc.statut !== 'en_attente' && (
                                  <button onClick={() => openReturnModal(bdc)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-100 transition-colors">
                                    <RotateCcw size={11} /> Retour
                                  </button>
                                )}
                                {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                              </div>
                            </td>
                          </tr>

                          {open && (
                            <tr key={`${bdc.id}-detail`}>
                              <td colSpan={6} className="px-5 pb-4 pt-0">
                                <div className="bg-gray-50 rounded-xl overflow-hidden">
                                  {/* Lignes de commande */}
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-100">
                                        <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Article</th>
                                        <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase">Commandé</th>
                                        {bdc.statut !== 'en_attente' && <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase">Reçu</th>}
                                        <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase">Prix/u</th>
                                        <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {(bdc.lines || []).map((l, i) => (
                                        <tr key={i}>
                                          <td className="px-4 py-2 text-gray-700">{l.stock_item?.nom} <span className="text-gray-400 text-xs">({l.stock_item?.unite})</span></td>
                                          <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{l.quantite_commandee}</td>
                                          {bdc.statut !== 'en_attente' && (
                                            <td className="px-4 py-2 text-right tabular-nums">
                                              <span className={l.quantite_recue === l.quantite_commandee ? 'text-green-600' : 'text-orange-500'}>{l.quantite_recue ?? '—'}</span>
                                            </td>
                                          )}
                                          <td className="px-4 py-2 text-right text-gray-400 tabular-nums">{l.prix_unitaire.toFixed(2)}</td>
                                          <td className="px-4 py-2 text-right font-semibold text-gray-900 tabular-nums">
                                            {((l.quantite_recue ?? l.quantite_commandee) * l.prix_unitaire).toFixed(2)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>

                                  {/* Footer : envoi BDC */}
                                  {bdc.supplier && (
                                    <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                                      <span className="text-xs text-gray-500 font-medium">Envoyer le BDC :</span>
                                      <SendButtons supplier={bdc.supplier} message={bdcMsg} />
                                    </div>
                                  )}

                                  {/* Retours existants */}
                                  {bdcReturns.length > 0 && (
                                    <div className="border-t border-gray-200">
                                      <div className="px-4 py-2 bg-orange-50/60">
                                        <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                                          <ArrowLeftRight size={11} /> {bdcReturns.length} retour{bdcReturns.length > 1 ? 's' : ''} fournisseur
                                        </p>
                                      </div>
                                      {bdcReturns.map(r => (
                                        <div key={r.id} className="px-4 py-3 border-t border-orange-100">
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-semibold text-gray-700">{fmtDate(r.date)}</span>
                                              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">{r.raison}</span>
                                            </div>
                                            <span className="text-sm font-bold text-orange-700">-{fmtPrice(r.total)}</span>
                                          </div>
                                          {(r.lines || []).length > 0 && (
                                            <div className="space-y-1">
                                              {(r.lines || []).map((rl, i) => (
                                                <div key={i} className="flex items-center justify-between text-xs text-gray-500">
                                                  <span>{rl.stock_item?.nom}</span>
                                                  <span className="tabular-nums">{rl.quantite} {rl.stock_item?.unite} × {rl.prix_unitaire.toFixed(2)} MAD</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          {r.note && <p className="text-xs text-gray-400 italic mt-1">"{r.note}"</p>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cartes mobile */}
              <div className="sm:hidden divide-y divide-gray-50">
                {displayed.map(bdc => {
                  const st = ST[bdc.statut];
                  return (
                    <div key={bdc.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{bdc.supplier?.nom}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(bdc.date)} · {(bdc.lines || []).length} article{(bdc.lines || []).length > 1 ? 's' : ''} · {fmtPrice(bdc.total)}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${st.bg} ${st.color}`}>{st.label}</span>
                        {bdc.statut === 'en_attente' ? (
                          <button onClick={() => startReceiving(bdc)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold">
                            <Truck size={11} /> Reçu
                          </button>
                        ) : (
                          <button onClick={() => openReturnModal(bdc)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg text-xs font-semibold">
                            <RotateCcw size={11} /> Retour
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modal réception ─────────────────────────────────────────────── */}
      {receivingBdc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900">Réception — {receivingBdc.supplier?.nom}</p>
                <p className="text-sm text-gray-400">{fmtDate(receivingBdc.date)} · {(receivingBdc.lines || []).length} article{(receivingBdc.lines || []).length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setReceivingBdc(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {(receivingBdc.lines || []).map((line, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{line.stock_item?.nom}</p>
                    <p className="text-xs text-gray-400">Commandé : <span className="font-medium text-gray-600">{line.quantite_commandee} {line.stock_item?.unite}</span></p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 font-medium">Reçu</span>
                    <input type="number" min={0}
                      value={line.id ? (receivedQtys[line.id] ?? line.quantite_commandee) : line.quantite_commandee}
                      onChange={e => line.id && setReceivedQtys(p => ({ ...p, [line.id!]: parseFloat(e.target.value) || 0 }))}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-xs text-gray-400">{line.stock_item?.unite}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 space-y-3 shrink-0">
              <p className="text-sm font-semibold text-gray-700 text-center">La livraison est-elle complète ?</p>
              <div className="flex gap-2">
                <button onClick={confirmReceiveAndReturn} disabled={saving}
                  className="flex-1 py-2.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-100 disabled:opacity-40 flex items-center justify-center gap-1.5">
                  <RotateCcw size={14} /> Retour
                </button>
                <button onClick={() => confirmReceive(true)}
                  disabled={saving || (receivingBdc?.lines || []).some(l => l.id && (receivedQtys[l.id] ?? l.quantite_commandee) !== l.quantite_commandee)}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-green-700 flex items-center justify-center gap-1.5">
                  <FileText size={14} /> Oui → Créer la facture
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal retour fournisseur ─────────────────────────────────────── */}
      {returnModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900">Retour fournisseur — {returnModal.supplier?.nom}</p>
                <p className="text-sm text-gray-400">Commande du {fmtDate(returnModal.date)}</p>
              </div>
              <button onClick={() => setReturnModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Date + motif */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500">Date du retour</span>
                  <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500">Motif *</span>
                  <select value={returnRaison} onChange={e => setReturnRaison(e.target.value)}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                    {RAISONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </label>
              </div>

              {/* Articles à retourner */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quantités à retourner</p>
                <div className="space-y-2">
                  {returnLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{line.nom}</p>
                        <p className="text-xs text-gray-400">Reçu : {line.max_qty} {line.unite}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input type="number" min={0} max={line.max_qty} step={1}
                          value={line.quantite || ''}
                          placeholder="0"
                          onChange={e => {
                            const v = Math.min(parseFloat(e.target.value) || 0, line.max_qty);
                            setReturnLines(p => p.map((l, i) => i === idx ? { ...l, quantite: v } : l));
                          }}
                          className={`w-20 px-2 py-1.5 border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400 ${line.quantite > 0 ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`} />
                        <span className="text-xs text-gray-400">{line.unite}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Note */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">Note (optionnel)</span>
                <input value={returnNote} onChange={e => setReturnNote(e.target.value)}
                  placeholder="Ex : odeur anormale, moisissures…"
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </label>

              {/* Total */}
              {returnLines.some(l => l.quantite > 0) && (
                <div className="flex items-center justify-between px-4 py-3 bg-orange-50 rounded-xl">
                  <span className="text-sm font-semibold text-orange-700">Total à déduire</span>
                  <span className="text-lg font-black text-orange-700">
                    -{fmtPrice(returnLines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0))}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setReturnModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={saveReturn}
                disabled={savingReturn || !returnLines.some(l => l.quantite > 0)}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-orange-600 flex items-center justify-center gap-2">
                <RotateCcw size={14} /> {savingReturn ? 'Enregistrement…' : 'Valider le retour'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
