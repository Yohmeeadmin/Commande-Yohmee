'use client';

import { useEffect, useState } from 'react';
import { Plus, X, AlertTriangle, ChevronDown, ChevronUp, Truck, FileText, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Supplier { id: string; nom: string; }
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

const ST = {
  en_attente:   { label: 'En attente',   bg: 'bg-orange-100', color: 'text-orange-700' },
  recu_partiel: { label: 'Reçu partiel', bg: 'bg-blue-100',   color: 'text-blue-700' },
  recu_complet: { label: 'Reçu complet', bg: 'bg-green-100',  color: 'text-green-700' },
};

export default function BonsCommandePage() {
  const [bons, setBons] = useState<BDC[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulaire
  const [fSupplierId, setFSupplierId] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fNote, setFNote] = useState('');
  const [fLines, setFLines] = useState<{ stock_item_id: string; quantite_commandee: number; prix_unitaire: number }[]>([]);

  // Modal réception
  const [receivingBdc, setReceivingBdc] = useState<BDC | null>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: b }, { data: s }, { data: i }] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, supplier:suppliers(nom), lines:purchase_order_lines(*, stock_item:stock_items(nom, unite))')
        .order('date', { ascending: false }),
      supabase.from('suppliers').select('id, nom').order('nom'),
      supabase.from('stock_items').select('*').order('nom'),
    ]);
    setBons((b as BDC[]) || []);
    setSuppliers(s || []);
    setItems((i as StockItem[]) || []);
    setLoading(false);
  }

  // Articles triés : ceux du fournisseur sélectionné en premier
  const orderedItems = fSupplierId
    ? [...items.filter(i => i.supplier_id === fSupplierId), ...items.filter(i => i.supplier_id !== fSupplierId)]
    : items;

  const alertItems = items.filter(i => i.stock_actuel <= i.stock_min);
  const supplierAlertItems = fSupplierId ? alertItems.filter(i => i.supplier_id === fSupplierId) : alertItems;

  function handleSupplierChange(id: string) {
    setFSupplierId(id);
    // Pré-remplir avec les articles en alerte du fournisseur
    const alerts = items.filter(i => i.supplier_id === id && i.stock_actuel <= i.stock_min);
    setFLines(alerts.map(i => ({
      stock_item_id: i.id,
      quantite_commandee: Math.max(i.stock_min - i.stock_actuel, 1),
      prix_unitaire: i.prix_moyen_pondere || 0,
    })));
  }

  function handleLineItem(idx: number, itemId: string) {
    const item = items.find(i => i.id === itemId);
    setFLines(p => p.map((l, i) => i === idx ? { ...l, stock_item_id: itemId, prix_unitaire: item?.prix_moyen_pondere || l.prix_unitaire } : l));
  }

  function updateLine(idx: number, k: string, v: any) {
    setFLines(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l));
  }

  const fTotal = fLines.reduce((s, l) => s + l.quantite_commandee * l.prix_unitaire, 0);

  async function saveBDC() {
    if (!fSupplierId || !fLines.length || fLines.some(l => !l.stock_item_id)) return;
    setSaving(true);
    const { data: bdc } = await supabase.from('purchase_orders').insert({
      supplier_id: fSupplierId, date: fDate,
      statut: 'en_attente', note: fNote || null, total: fTotal,
    }).select().single();
    if (bdc) {
      await supabase.from('purchase_order_lines').insert(fLines.map(l => ({ ...l, order_id: bdc.id })));
      setShowForm(false); setFSupplierId(''); setFNote(''); setFLines([]);
      load();
    }
    setSaving(false);
  }

  function startReceiving(bdc: BDC) {
    setReceivingBdc(bdc);
    const qtys: Record<string, number> = {};
    (bdc.lines || []).forEach(l => { if (l.id) qtys[l.id] = l.quantite_commandee; });
    setReceivedQtys(qtys);
  }

  async function confirmReceive(complete: boolean) {
    if (!receivingBdc) return;
    setSaving(true);
    await supabase.from('purchase_orders').update({ statut: complete ? 'recu_complet' : 'recu_partiel' }).eq('id', receivingBdc.id);
    for (const line of receivingBdc.lines || []) {
      if (line.id) await supabase.from('purchase_order_lines').update({ quantite_recue: receivedQtys[line.id] ?? line.quantite_commandee }).eq('id', line.id);
    }
    if (complete) {
      const invoiceTotal = (receivingBdc.lines || []).reduce((s, l) => {
        const qty = l.id ? (receivedQtys[l.id] ?? l.quantite_commandee) : l.quantite_commandee;
        return s + qty * l.prix_unitaire;
      }, 0);
      const { data: inv } = await supabase.from('supplier_invoices').insert({
        supplier_id: receivingBdc.supplier_id,
        numero: null,
        date_facture: new Date().toISOString().slice(0, 10),
        statut: 'brouillon', total: invoiceTotal,
      }).select().single();
      if (inv) {
        await supabase.from('supplier_invoice_lines').insert(
          (receivingBdc.lines || []).map(l => ({
            invoice_id: inv.id, stock_item_id: l.stock_item_id,
            quantite: l.id ? (receivedQtys[l.id] ?? l.quantite_commandee) : l.quantite_commandee,
            prix_unitaire: l.prix_unitaire,
          }))
        );
      }
    }
    setReceivingBdc(null); setReceivedQtys({}); load(); setSaving(false);
  }

  const pendingBons = bons.filter(b => b.statut === 'en_attente');
  const doneBons = bons.filter(b => b.statut !== 'en_attente');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bons de commande</h1>
          <p className="text-sm text-gray-400">{pendingBons.length} en attente · {alertItems.length} article{alertItems.length > 1 ? 's' : ''} en alerte</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
          <Plus size={15} /> Nouveau BDC
        </button>
      </div>

      {/* Bandeau alertes stock */}
      {alertItems.length > 0 && !showForm && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-orange-600" />
            <p className="text-sm font-semibold text-orange-700">{alertItems.length} article{alertItems.length > 1 ? 's' : ''} à réapprovisionner</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alertItems.slice(0, 10).map(i => (
              <span key={i.id} className="text-xs px-2 py-1 bg-white border border-orange-200 text-orange-700 rounded-lg">
                {i.nom} <span className="text-orange-400">{i.stock_actuel}/{i.stock_min} {i.unite}</span>
              </span>
            ))}
            {alertItems.length > 10 && <span className="text-xs text-orange-400 self-center">+{alertItems.length - 10} autres</span>}
          </div>
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">Nouveau bon de commande</p>
            <button onClick={() => { setShowForm(false); setFSupplierId(''); setFLines([]); }}><X size={18} className="text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={fSupplierId} onChange={e => handleSupplierChange(e.target.value)}
              className="sm:col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Fournisseur *</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
            <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Note"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {fSupplierId && supplierAlertItems.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-xl">
              <AlertTriangle size={13} className="text-orange-500" />
              <p className="text-xs text-orange-700 font-medium">{supplierAlertItems.length} article{supplierAlertItems.length > 1 ? 's' : ''} en alerte pré-ajouté{supplierAlertItems.length > 1 ? 's' : ''}</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Articles</p>
            {fLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select value={line.stock_item_id} onChange={e => handleLineItem(idx, e.target.value)}
                  className="sm:col-span-5 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                  <option value="">— Article</option>
                  {orderedItems.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.supplier_id === fSupplierId ? '★ ' : ''}{i.nom} ({i.unite})
                    </option>
                  ))}
                </select>
                <input type="number" min={0} step={0.01} value={line.quantite_commandee}
                  onChange={e => updateLine(idx, 'quantite_commandee', parseFloat(e.target.value) || 0)}
                  className="sm:col-span-3 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none" placeholder="Qté" />
                <input type="number" min={0} step={0.01} value={line.prix_unitaire}
                  onChange={e => updateLine(idx, 'prix_unitaire', parseFloat(e.target.value) || 0)}
                  className="sm:col-span-3 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none" placeholder="Prix" />
                <button onClick={() => setFLines(p => p.filter((_, i) => i !== idx))} className="sm:col-span-1 flex justify-center text-red-400">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button onClick={() => setFLines(p => [...p, { stock_item_id: '', quantite_commandee: 1, prix_unitaire: 0 }])}
              className="w-full py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center gap-1.5">
              <Plus size={12} /> Ajouter un article
            </button>
          </div>

          {fLines.length > 0 && (
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <span className="text-sm text-gray-500">Total estimé</span>
              <span className="font-bold text-gray-900">{fTotal.toFixed(2)} MAD</span>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setFSupplierId(''); setFLines([]); }}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
            <button onClick={saveBDC} disabled={saving || !fSupplierId || !fLines.length || fLines.some(l => !l.stock_item_id)}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
              {saving ? 'Création…' : 'Créer le BDC'}
            </button>
          </div>
        </div>
      )}

      {/* Modal réception */}
      {receivingBdc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">Réception</p>
                <p className="text-sm text-gray-400">{receivingBdc.supplier?.nom} · {new Date(receivingBdc.date).toLocaleDateString('fr-FR')}</p>
              </div>
              <button onClick={() => setReceivingBdc(null)}><X size={18} className="text-gray-400" /></button>
            </div>

            <div className="space-y-2 max-h-48 sm:max-h-60 overflow-y-auto">
              {(receivingBdc.lines || []).map((line, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{line.stock_item?.nom}</p>
                    <p className="text-xs text-gray-400">Commandé : {line.quantite_commandee} {line.stock_item?.unite}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">Reçu</span>
                    <input type="number" min={0}
                      value={line.id ? (receivedQtys[line.id] ?? line.quantite_commandee) : line.quantite_commandee}
                      onChange={e => line.id && setReceivedQtys(p => ({ ...p, [line.id!]: parseFloat(e.target.value) || 0 }))}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-2">
              <p className="text-sm font-semibold text-gray-700">Commande complète ?</p>
              <div className="flex gap-2">
                <button onClick={() => confirmReceive(false)} disabled={saving}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium disabled:opacity-40">
                  Non — partielle
                </button>
                <button onClick={() => confirmReceive(true)} disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5">
                  <FileText size={14} /> Oui → Créer facture
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading && bons.length === 0 ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : bons.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun bon de commande</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingBons.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase px-1">En attente ({pendingBons.length})</p>
              {pendingBons.map(bdc => (
                <BDCCard key={bdc.id} bdc={bdc} expandedId={expandedId} setExpandedId={setExpandedId}
                  onReceive={() => startReceiving(bdc)} />
              ))}
            </div>
          )}
          {doneBons.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase px-1">Terminés ({doneBons.length})</p>
              {doneBons.map(bdc => (
                <BDCCard key={bdc.id} bdc={bdc} expandedId={expandedId} setExpandedId={setExpandedId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BDCCard({ bdc, expandedId, setExpandedId, onReceive }: {
  bdc: BDC; expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onReceive?: () => void;
}) {
  const open = expandedId === bdc.id;
  const st = ST[bdc.statut];
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${bdc.statut === 'en_attente' ? 'border-orange-200' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={() => setExpandedId(open ? null : bdc.id)} className="flex-1 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{bdc.supplier?.nom}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${st.bg} ${st.color}`}>{st.label}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(bdc.date).toLocaleDateString('fr-FR')} · {(bdc.lines || []).length} article{(bdc.lines || []).length > 1 ? 's' : ''} · {bdc.total.toFixed(2)} MAD
          </p>
          {bdc.note && <p className="text-xs text-gray-400 italic mt-0.5">"{bdc.note}"</p>}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {bdc.statut === 'en_attente' && onReceive && (
            <button onClick={onReceive}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700">
              <Truck size={12} /> Reçu
            </button>
          )}
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>
      {open && (bdc.lines || []).length > 0 && (
        <div className="border-t border-gray-50 px-4 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2 min-w-[320px]">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="text-left pb-1">Article</th>
                  <th className="text-right pb-1">Commandé</th>
                  {bdc.statut !== 'en_attente' && <th className="text-right pb-1">Reçu</th>}
                  <th className="text-right pb-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {(bdc.lines || []).map((l, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1.5 text-gray-700">{l.stock_item?.nom} <span className="text-gray-400">({l.stock_item?.unite})</span></td>
                    <td className="text-right text-gray-700">{l.quantite_commandee}</td>
                    {bdc.statut !== 'en_attente' && <td className="text-right text-gray-700">{l.quantite_recue ?? '—'}</td>}
                    <td className="text-right font-semibold text-gray-900">{(l.quantite_commandee * l.prix_unitaire).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
