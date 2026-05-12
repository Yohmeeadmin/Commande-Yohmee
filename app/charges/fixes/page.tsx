'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const CATEGORIES = ['Loyer', 'Assurance', 'Leasing matériel', 'Leasing véhicule', 'Abonnement logiciel', 'Expert-comptable', 'Banque', 'Téléphone / Internet', 'Autre'];

interface ChargeFix {
  id: string;
  nom: string;
  categorie: string;
  montant: number;
  actif: boolean;
}

function fmt(n: number) {
  return n.toLocaleString('fr-MA', { maximumFractionDigits: 0 }) + ' MAD';
}

export default function ChargesFixesPage() {
  const [charges, setCharges] = useState<ChargeFix[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<ChargeFix | null>(null);
  const [form, setForm] = useState({ nom: '', categorie: 'Loyer', montant: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('charges_fixes').select('*').eq('actif', true).order('categorie').order('nom');
    setCharges((data as ChargeFix[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditItem(null);
    setForm({ nom: '', categorie: 'Loyer', montant: '' });
    setModalOpen(true);
  }

  function openEdit(c: ChargeFix) {
    setEditItem(c);
    setForm({ nom: c.nom, categorie: c.categorie, montant: String(c.montant) });
    setModalOpen(true);
  }

  async function save() {
    if (!form.nom.trim() || !form.montant) return;
    setSaving(true);
    const payload = { nom: form.nom.trim(), categorie: form.categorie, montant: Number(form.montant) };
    if (editItem) {
      await supabase.from('charges_fixes').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('charges_fixes').insert({ ...payload, actif: true });
    }
    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette charge ?')) return;
    await supabase.from('charges_fixes').update({ actif: false }).eq('id', id);
    load();
  }

  const total = charges.reduce((s, c) => s + c.montant, 0);

  // Grouper par catégorie
  const byCategorie = new Map<string, ChargeFix[]>();
  charges.forEach(c => {
    const prev = byCategorie.get(c.categorie) ?? [];
    byCategorie.set(c.categorie, [...prev, c]);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-none">Charges fixes</h1>
          <p className="text-sm text-gray-400 mt-1">Reconduites automatiquement chaque mois</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm">
          <Plus size={16} />Ajouter
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1.5">Nombre de charges</p>
          <p className="text-2xl font-black text-gray-900">{charges.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1.5">Total mensuel</p>
          <p className="text-xl font-black text-blue-600 leading-none">{fmt(total)}</p>
        </div>
      </div>

      {/* Liste groupée */}
      {loading ? (
        <div className="flex items-center justify-center h-40 bg-white rounded-2xl border border-gray-100">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : charges.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <p className="text-sm text-gray-300 mb-3">Aucune charge fixe</p>
          <button onClick={openNew} className="text-sm text-blue-600 font-semibold">+ Ajouter</button>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(byCategorie.entries()).map(([cat, items]) => (
            <div key={cat} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{cat}</p>
                <p className="text-xs font-bold text-gray-700">{fmt(items.reduce((s, i) => s + i.montant, 0))}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50">
                    <p className="text-sm font-medium text-gray-900">{c.nom}</p>
                    <div className="flex items-center gap-4">
                      <p className="text-sm font-bold text-gray-900">{fmt(c.montant)}</p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => remove(c.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-center justify-between">
            <p className="text-sm font-bold text-blue-800">Total charges fixes / mois</p>
            <p className="text-lg font-black text-blue-600">{fmt(total)}</p>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setModalOpen(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-xl p-5 max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-5">
              <p className="font-semibold text-gray-900">{editItem ? 'Modifier' : 'Nouvelle charge fixe'}</p>
              <button onClick={() => setModalOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Catégorie</label>
                <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-400">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Libellé *</label>
                <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                  placeholder="Ex : Loyer local Casablanca" autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Montant mensuel (MAD) *</label>
                <input type="number" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                  placeholder="5000" min={0} />
              </div>
            </div>
            <button onClick={save} disabled={saving || !form.nom.trim() || !form.montant}
              className="mt-5 w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
