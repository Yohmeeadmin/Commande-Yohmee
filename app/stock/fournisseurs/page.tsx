'use client';

import { useEffect, useState } from 'react';
import { Plus, Phone, Mail, Edit2, X, Trash2, Users, Hash } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Supplier {
  id: string;
  nom: string;
  reference: string | null;
  ice: string | null;
  rc: string | null;
  telephone: string | null;
  email: string | null;
  notes: string | null;
}
interface StockItem { id: string; nom: string; unite: string; stock_actuel: number; stock_min: number; prix_moyen_pondere: number; supplier_id: string | null; }

const UNITES = ['kg', 'g', 'L', 'cl', 'pièce', 'sachet', 'boîte', 'carton', 'litre'];

const emptySupplier = (): Omit<Supplier, 'id'> => ({ nom: '', reference: null, ice: null, rc: null, telephone: null, email: null, notes: null });
const emptyItem = (): Omit<StockItem, 'id' | 'supplier_id'> => ({ nom: '', unite: 'kg', stock_actuel: 0, stock_min: 0, prix_moyen_pondere: 0 });

export default function FournisseursPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [newSupplier, setNewSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState(emptySupplier());
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [newItem, setNewItem] = useState<{ supplierId: string } | null>(null);
  const [itemForm, setItemForm] = useState(emptyItem());

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: s }, { data: i }] = await Promise.all([
      supabase.from('suppliers').select('*').order('nom'),
      supabase.from('stock_items').select('*').order('nom'),
    ]);
    setSuppliers(s || []);
    setItems(i || []);
    setLoading(false);
  }

  async function saveSupplier() {
    if (!supplierForm.nom.trim()) return;
    setSaving(true);
    if (editSupplier) {
      await supabase.from('suppliers').update(supplierForm).eq('id', editSupplier.id);
      setSuppliers(prev => prev.map(s => s.id === editSupplier.id ? { ...s, ...supplierForm } : s));
    } else {
      const { data } = await supabase.from('suppliers').insert(supplierForm).select().single();
      if (data) setSuppliers(prev => [...prev, data]);
    }
    setEditSupplier(null); setNewSupplier(false); setSupplierForm(emptySupplier()); setSaving(false);
  }

  async function deleteSupplier(id: string) {
    if (!confirm('Supprimer ce fournisseur ?')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }

  async function saveItem() {
    if (!itemForm.nom.trim()) return;
    setSaving(true);
    if (editItem) {
      await supabase.from('stock_items').update(itemForm).eq('id', editItem.id);
      setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, ...itemForm } : i));
      setEditItem(null);
    } else if (newItem) {
      const { data } = await supabase.from('stock_items').insert({ ...itemForm, supplier_id: newItem.supplierId }).select().single();
      if (data) setItems(prev => [...prev, data]);
      setNewItem(null);
    }
    setItemForm(emptyItem()); setSaving(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Supprimer cet article ?')) return;
    await supabase.from('stock_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  const SF = (k: keyof typeof supplierForm, v: string) => setSupplierForm(p => ({ ...p, [k]: v || null }));
  const IF = (k: keyof typeof itemForm, v: any) => setItemForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-sm text-gray-400">{suppliers.length} fournisseur{suppliers.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setNewSupplier(true); setEditSupplier(null); setSupplierForm(emptySupplier()); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
          <Plus size={15} /> Fournisseur
        </button>
      </div>

      {/* Formulaire fournisseur */}
      {(newSupplier || editSupplier) && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 space-y-3">
          <p className="font-semibold text-gray-900">{editSupplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</p>
          <input value={supplierForm.nom} onChange={e => SF('nom', e.target.value)} placeholder="Nom *"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={supplierForm.reference ?? ''} onChange={e => SF('reference', e.target.value)} placeholder="Référence (FS-0001)"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={supplierForm.telephone ?? ''} onChange={e => SF('telephone', e.target.value)} placeholder="Téléphone"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={supplierForm.ice ?? ''} onChange={e => SF('ice', e.target.value)} placeholder="ICE"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={supplierForm.rc ?? ''} onChange={e => SF('rc', e.target.value)} placeholder="RC"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={supplierForm.email ?? ''} onChange={e => SF('email', e.target.value)} placeholder="Email"
              className="sm:col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <textarea value={supplierForm.notes ?? ''} onChange={e => SF('notes', e.target.value)} placeholder="Notes"
            rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => { setNewSupplier(false); setEditSupplier(null); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
            <button onClick={saveSupplier} disabled={saving || !supplierForm.nom.trim()}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {loading && suppliers.length === 0 ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : suppliers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Users className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun fournisseur</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => {
            const sItems = items.filter(i => i.supplier_id === s.id);
            const open = expandedId === s.id;
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-start gap-3 px-4 py-3">
                  <button onClick={() => setExpandedId(open ? null : s.id)} className="flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{s.nom}</p>
                      {s.reference && <span className="text-xs text-gray-400 font-mono">{s.reference}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {s.telephone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={11} />{s.telephone}</span>}
                      {s.email && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={11} />{s.email}</span>}
                      {s.ice && <span className="text-xs text-gray-400 flex items-center gap-1"><Hash size={11} />ICE {s.ice}</span>}
                      {s.rc && <span className="text-xs text-gray-400">RC {s.rc}</span>}
                      <span className="text-xs text-blue-600 font-medium">{sItems.length} article{sItems.length > 1 ? 's' : ''}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditSupplier(s); setNewSupplier(false); setSupplierForm({ nom: s.nom, reference: s.reference, ice: s.ice, rc: s.rc, telephone: s.telephone, email: s.email, notes: s.notes }); }}
                      className="p-2.5 sm:p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
                    <button onClick={() => deleteSupplier(s.id)} className="p-2.5 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-50 px-4 pb-3 pt-2 space-y-2">
                    {sItems.map(item => (
                      <div key={item.id}>
                        {editItem?.id === item.id ? (
                          <div className="space-y-2 p-3 bg-blue-50 rounded-xl">
                            <input value={itemForm.nom} onChange={e => IF('nom', e.target.value)} placeholder="Nom *"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <select value={itemForm.unite} onChange={e => IF('unite', e.target.value)}
                                className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                                {UNITES.map(u => <option key={u}>{u}</option>)}
                              </select>
                              <input type="number" value={itemForm.stock_min} onChange={e => IF('stock_min', parseFloat(e.target.value) || 0)} placeholder="Seuil min"
                                className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                              <input type="number" value={itemForm.stock_actuel} onChange={e => IF('stock_actuel', parseFloat(e.target.value) || 0)} placeholder="Stock"
                                className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setEditItem(null); setItemForm(emptyItem()); }} className="flex-1 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500">Annuler</button>
                              <button onClick={saveItem} disabled={saving} className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40">Enregistrer</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{item.nom}</p>
                              <p className="text-xs text-gray-400">Stock : {item.stock_actuel} {item.unite} · Seuil : {item.stock_min} {item.unite}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => { setEditItem(item); setItemForm({ nom: item.nom, unite: item.unite, stock_actuel: item.stock_actuel, stock_min: item.stock_min, prix_moyen_pondere: item.prix_moyen_pondere }); }}
                                className="p-2.5 sm:p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                              <button onClick={() => deleteItem(item.id)} className="p-2.5 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {newItem?.supplierId === s.id ? (
                      <div className="space-y-2 p-3 bg-green-50 rounded-xl">
                        <input value={itemForm.nom} onChange={e => IF('nom', e.target.value)} placeholder="Nom de l'article *" autoFocus
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select value={itemForm.unite} onChange={e => IF('unite', e.target.value)}
                            className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                            {UNITES.map(u => <option key={u}>{u}</option>)}
                          </select>
                          <input type="number" min={0} value={itemForm.stock_min} onChange={e => IF('stock_min', parseFloat(e.target.value) || 0)} placeholder="Seuil min"
                            className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                          <input type="number" min={0} value={itemForm.stock_actuel} onChange={e => IF('stock_actuel', parseFloat(e.target.value) || 0)} placeholder="Stock init."
                            className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setNewItem(null); setItemForm(emptyItem()); }} className="flex-1 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500">Annuler</button>
                          <button onClick={saveItem} disabled={saving || !itemForm.nom.trim()} className="flex-1 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40">Ajouter</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setNewItem({ supplierId: s.id }); setEditItem(null); setItemForm(emptyItem()); }}
                        className="w-full py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center gap-1.5">
                        <Plus size={12} /> Ajouter un article
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
