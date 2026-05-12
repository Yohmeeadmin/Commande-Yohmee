'use client';

import React, { useEffect, useState } from 'react';
import { Plus, FileText, CheckCircle, ChevronDown, ChevronUp, Trash2, X, Square, CheckSquare, RotateCcw, LayoutList, Table2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Supplier { id: string; nom: string; }
interface StockItem { id: string; nom: string; unite: string; supplier_id: string | null; }
interface InvoiceLine { id?: string; stock_item_id: string; quantite: number; prix_unitaire: number; stock_item?: StockItem; }
interface Invoice {
  id: string; supplier_id: string; numero: string; date_facture: string;
  statut: 'brouillon' | 'validee'; total: number;
  supplier?: Supplier;
  lines?: InvoiceLine[];
}

export default function FacturesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Sélection multiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Formulaire
  const [fSupplierId, setFSupplierId] = useState('');
  const [fNumero, setFNumero] = useState('');
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fLines, setFLines] = useState<{ stock_item_id: string; quantite: number; prix_unitaire: number }[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: inv }, { data: sup }, { data: itm }] = await Promise.all([
      supabase.from('supplier_invoices').select('*, supplier:suppliers(nom), lines:supplier_invoice_lines(*, stock_item:stock_items(nom, unite))').order('date_facture', { ascending: false }),
      supabase.from('suppliers').select('id, nom').order('nom'),
      supabase.from('stock_items').select('id, nom, unite, supplier_id').order('nom'),
    ]);
    setInvoices((inv as Invoice[]) || []);
    setSuppliers(sup || []);
    setItems(itm || []);
    setLoading(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
    }
  }

  async function bulkDelete() {
    if (!confirm(`Supprimer ${selectedIds.size} facture(s) ?`)) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    await supabase.from('supplier_invoice_lines').delete().in('invoice_id', ids);
    await supabase.from('supplier_invoices').delete().in('id', ids);
    await load();
    setBulkLoading(false);
  }

  async function bulkSetStatus(statut: 'brouillon' | 'validee') {
    if (statut === 'validee') {
      if (!confirm(`Valider ${selectedIds.size} facture(s) ? Le stock sera mis à jour pour les brouillons.`)) return;
    }
    setBulkLoading(true);
    const ids = Array.from(selectedIds);

    if (statut === 'validee') {
      // Valider uniquement les brouillons parmi la sélection
      const toValidate = invoices.filter(i => ids.includes(i.id) && i.statut === 'brouillon');
      for (const inv of toValidate) {
        await supabase.from('supplier_invoices').update({ statut: 'validee' }).eq('id', inv.id);
        for (const line of inv.lines || []) {
          const { data: item } = await supabase.from('stock_items').select('stock_actuel, prix_moyen_pondere').eq('id', line.stock_item_id).single();
          if (!item) continue;
          const newQty = (item.stock_actuel || 0) + line.quantite;
          const newPmp = ((item.stock_actuel || 0) * (item.prix_moyen_pondere || 0) + line.quantite * line.prix_unitaire) / newQty;
          await supabase.from('stock_items').update({ stock_actuel: newQty, prix_moyen_pondere: newPmp }).eq('id', line.stock_item_id);
          await supabase.from('stock_movements').insert({ stock_item_id: line.stock_item_id, type: 'entree_facture', quantite: line.quantite, prix_unitaire: line.prix_unitaire, reference_id: inv.id, reference_type: 'supplier_invoice', date: inv.date_facture });
        }
      }
    } else {
      // Mettre en brouillon uniquement les validées
      const toReset = invoices.filter(i => ids.includes(i.id) && i.statut === 'validee');
      if (toReset.length > 0) {
        if (!confirm(`Attention : remettre ${toReset.length} facture(s) validée(s) en brouillon ne remettra pas le stock à jour.`)) {
          setBulkLoading(false);
          return;
        }
      }
      await supabase.from('supplier_invoices').update({ statut: 'brouillon' }).in('id', ids);
    }

    await load();
    setBulkLoading(false);
  }

  function addLine() {
    setFLines(p => [...p, { stock_item_id: '', quantite: 1, prix_unitaire: 0 }]);
  }

  function updateLine(idx: number, k: string, v: any) {
    setFLines(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l));
  }

  function removeLine(idx: number) {
    setFLines(p => p.filter((_, i) => i !== idx));
  }

  const fTotal = fLines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

  async function saveInvoice() {
    if (!fSupplierId || !fLines.length || fLines.some(l => !l.stock_item_id)) return;
    setSaving(true);
    const { data: inv, error } = await supabase.from('supplier_invoices').insert({
      supplier_id: fSupplierId,
      numero: fNumero || null,
      date_facture: fDate,
      statut: 'brouillon',
      total: fTotal,
    }).select().single();

    if (!error && inv) {
      await supabase.from('supplier_invoice_lines').insert(fLines.map(l => ({ ...l, invoice_id: inv.id })));
      setShowForm(false);
      setFSupplierId(''); setFNumero(''); setFLines([]);
      load();
    }
    setSaving(false);
  }

  async function validerFacture(inv: Invoice) {
    if (!confirm(`Valider la facture ${inv.numero || inv.id.slice(0, 8)} ? Le stock sera mis à jour.`)) return;
    await supabase.from('supplier_invoices').update({ statut: 'validee' }).eq('id', inv.id);
    for (const line of inv.lines || []) {
      const { data: item } = await supabase.from('stock_items').select('stock_actuel, prix_moyen_pondere').eq('id', line.stock_item_id).single();
      if (!item) continue;
      const newQty = (item.stock_actuel || 0) + line.quantite;
      const newPmp = ((item.stock_actuel || 0) * (item.prix_moyen_pondere || 0) + line.quantite * line.prix_unitaire) / newQty;
      await supabase.from('stock_items').update({ stock_actuel: newQty, prix_moyen_pondere: newPmp }).eq('id', line.stock_item_id);
      await supabase.from('stock_movements').insert({ stock_item_id: line.stock_item_id, type: 'entree_facture', quantite: line.quantite, prix_unitaire: line.prix_unitaire, reference_id: inv.id, reference_type: 'supplier_invoice', date: inv.date_facture });
    }
    load();
  }

  async function supprimerFacture(id: string) {
    if (!confirm('Supprimer cette facture ?')) return;
    await supabase.from('supplier_invoice_lines').delete().eq('invoice_id', id);
    await supabase.from('supplier_invoices').delete().eq('id', id);
    setInvoices(p => p.filter(i => i.id !== id));
  }

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM

  const filteredInvoices = filterMonth
    ? invoices.filter(i => i.date_facture?.slice(0, 7) === filterMonth)
    : invoices;

  // Mois disponibles depuis les factures
  const availableMonths = Array.from(new Set(invoices.map(i => i.date_facture?.slice(0, 7)).filter(Boolean)))
    .sort((a, b) => b!.localeCompare(a!)) as string[];

  const allSelected = filteredInvoices.length > 0 && selectedIds.size === filteredInvoices.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Factures fournisseurs</h1>
          <p className="text-sm text-gray-400">{filteredInvoices.length} facture{filteredInvoices.length > 1 ? 's' : ''}{filterMonth ? ` · ${new Date(filterMonth + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-2 border border-gray-200 bg-white rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tous les mois</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={() => setViewMode('cards')} className={`px-3 py-2 transition-colors ${viewMode === 'cards' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}><LayoutList size={15} /></button>
            <button onClick={() => setViewMode('table')} className={`px-3 py-2 transition-colors ${viewMode === 'table' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}><Table2 size={15} /></button>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={15} /> Nouvelle
          </button>
        </div>
      </div>

      {/* Formulaire nouvelle facture */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">Nouvelle facture</p>
            <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={fSupplierId} onChange={e => setFSupplierId(e.target.value)}
              className="col-span-1 sm:col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Fournisseur *</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
            <input value={fNumero} onChange={e => setFNumero(e.target.value)} placeholder="N° facture"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Lignes */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Articles</p>
            {fLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select value={line.stock_item_id} onChange={e => updateLine(idx, 'stock_item_id', e.target.value)}
                  className="col-span-11 sm:col-span-5 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                  <option value="">— Article</option>
                  {[...items.filter(i => i.supplier_id === fSupplierId), ...items.filter(i => i.supplier_id !== fSupplierId)].map(i => (
                    <option key={i.id} value={i.id}>{i.supplier_id === fSupplierId ? '★ ' : ''}{i.nom} ({i.unite})</option>
                  ))}
                </select>
                <button onClick={() => removeLine(idx)} className="col-span-1 sm:hidden flex justify-center text-red-400"><X size={14} /></button>
                <input type="number" min={0} step={0.01} value={line.quantite} onChange={e => updateLine(idx, 'quantite', parseFloat(e.target.value) || 0)}
                  className="col-span-5 sm:col-span-3 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none" placeholder="Qté" />
                <input type="number" min={0} step={0.01} value={line.prix_unitaire} onChange={e => updateLine(idx, 'prix_unitaire', parseFloat(e.target.value) || 0)}
                  className="col-span-6 sm:col-span-3 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none" placeholder="Prix" />
                <button onClick={() => removeLine(idx)} className="hidden sm:flex col-span-1 justify-center text-red-400"><X size={14} /></button>
              </div>
            ))}
            <button onClick={addLine} className="w-full py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center gap-1.5">
              <Plus size={12} /> Ajouter une ligne
            </button>
          </div>

          {fLines.length > 0 && (
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <span className="text-sm text-gray-500">Total</span>
              <span className="font-bold text-gray-900">{fTotal.toFixed(2)} MAD</span>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
            <button onClick={saveInvoice} disabled={saving || !fSupplierId || !fLines.length}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
              {saving ? 'Enregistrement…' : 'Enregistrer en brouillon'}
            </button>
          </div>
        </div>
      )}

      {/* Barre d'actions groupées */}
      {someSelected && (
        <div className="sticky top-0 z-10 bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-sm font-semibold flex-1">{selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
          <button onClick={() => bulkSetStatus('validee')} disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-semibold disabled:opacity-40">
            <CheckCircle size={13} /> Valider
          </button>
          <button onClick={() => bulkSetStatus('brouillon')} disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-semibold disabled:opacity-40">
            <RotateCcw size={13} /> Brouillon
          </button>
          <button onClick={bulkDelete} disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-semibold disabled:opacity-40">
            <Trash2 size={13} /> Supprimer
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Liste factures */}
      {loading && filteredInvoices.length === 0 ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <FileText className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucune facture</p>
        </div>
      ) : viewMode === 'table' ? (

        /* ── Vue tableau ── */
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs text-gray-400 uppercase">
                <th className="px-4 py-3 w-8">
                  <button onClick={toggleSelectAll} className="text-gray-300 hover:text-blue-500">
                    {allSelected ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                  </button>
                </th>
                <th className="text-left px-3 py-3">Fournisseur</th>
                <th className="text-left px-3 py-3 hidden sm:table-cell">N° facture</th>
                <th className="text-left px-3 py-3 hidden sm:table-cell">Date</th>
                <th className="text-right px-3 py-3">Total</th>
                <th className="text-center px-3 py-3">Statut</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => {
                const open = expandedId === inv.id;
                const valide = inv.statut === 'validee';
                const selected = selectedIds.has(inv.id);
                return (
                  <React.Fragment key={inv.id}>
                  <tr className={`border-t border-gray-50 hover:bg-gray-50 transition-colors ${selected ? 'bg-blue-50/60' : ''}`}>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleSelect(inv.id)} className="text-gray-300 hover:text-blue-500">
                        {selected ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{inv.supplier?.nom}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs hidden sm:table-cell">{inv.numero || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs hidden sm:table-cell">{new Date(inv.date_facture).toLocaleDateString('fr-FR')}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{inv.total.toFixed(2)} MAD</td>
                    <td className="px-3 py-2.5 text-center">
                      {valide
                        ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Validée</span>
                        : <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">Brouillon</span>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {!valide && (
                          <button onClick={() => validerFacture(inv)} className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700">
                            <CheckCircle size={11} /> Valider
                          </button>
                        )}
                        {!valide && (
                          <button onClick={() => supprimerFacture(inv.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                        )}
                        <button onClick={() => setExpandedId(open ? null : inv.id)} className="p-1.5 text-gray-400 hover:text-gray-600">
                          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (inv.lines || []).length > 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-4 pb-3 pt-1">
                        <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[320px]">
                          <thead><tr className="text-xs text-gray-400"><th className="text-left pb-1">Article</th><th className="text-right pb-1">Qté</th><th className="text-right pb-1">Prix unit.</th><th className="text-right pb-1">Total</th></tr></thead>
                          <tbody>
                            {(inv.lines || []).map((l, i) => (
                              <tr key={i} className="border-t border-gray-100">
                                <td className="py-1.5 text-gray-700">{l.stock_item?.nom} <span className="text-gray-400">({l.stock_item?.unite})</span></td>
                                <td className="text-right text-gray-700">{l.quantite}</td>
                                <td className="text-right text-gray-700">{l.prix_unitaire.toFixed(2)}</td>
                                <td className="text-right font-semibold text-gray-900">{(l.quantite * l.prix_unitaire).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr className="text-xs text-gray-500 font-semibold">
                <td colSpan={4} className="px-4 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right">{invoices.reduce((s, i) => s + i.total, 0).toFixed(2)} MAD</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

      ) : (

        /* ── Vue cards ── */
        <>
          <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 px-1">
            {allSelected ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>

          <div className="space-y-2">
            {filteredInvoices.map(inv => {
              const open = expandedId === inv.id;
              const valide = inv.statut === 'validee';
              const selected = selectedIds.has(inv.id);
              return (
                <div key={inv.id} className={`bg-white rounded-2xl border overflow-hidden transition-all ${selected ? 'border-blue-400 ring-1 ring-blue-300' : valide ? 'border-gray-100' : 'border-blue-200'}`}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <button onClick={() => toggleSelect(inv.id)} className="mt-0.5 shrink-0 text-gray-300 hover:text-blue-500">
                      {selected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                    </button>
                    <button onClick={() => setExpandedId(open ? null : inv.id)} className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{inv.supplier?.nom}</p>
                        {valide
                          ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Validée</span>
                          : <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">Brouillon</span>
                        }
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {inv.numero && `${inv.numero} · `}{new Date(inv.date_facture).toLocaleDateString('fr-FR')} · {inv.total.toFixed(2)} MAD
                      </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {!valide && (
                        <button onClick={() => validerFacture(inv)} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700">
                          <CheckCircle size={12} /> Valider
                        </button>
                      )}
                      {!valide && (
                        <button onClick={() => supprimerFacture(inv.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                      )}
                      {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </div>
                  {open && (inv.lines || []).length > 0 && (
                    <div className="border-t border-gray-50 px-4 pb-3">
                      <div className="overflow-x-auto">
                      <table className="w-full text-sm mt-2 min-w-[320px]">
                        <thead><tr className="text-xs text-gray-400"><th className="text-left pb-1">Article</th><th className="text-right pb-1">Qté</th><th className="text-right pb-1">Prix unit.</th><th className="text-right pb-1">Total</th></tr></thead>
                        <tbody>
                          {(inv.lines || []).map((l, i) => (
                            <tr key={i} className="border-t border-gray-50">
                              <td className="py-1.5 text-gray-700">{l.stock_item?.nom} <span className="text-gray-400">({l.stock_item?.unite})</span></td>
                              <td className="text-right text-gray-700">{l.quantite}</td>
                              <td className="text-right text-gray-700">{l.prix_unitaire.toFixed(2)}</td>
                              <td className="text-right font-semibold text-gray-900">{(l.quantite * l.prix_unitaire).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
