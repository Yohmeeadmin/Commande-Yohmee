'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, X, Check, Cpu } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Materiel {
  id: string;
  nom: string;
  capacite_kg: number;
  atelier: string | null;
  notes: string | null;
}

const EMPTY_FORM = { nom: '', capacite_kg: '', atelier: '', notes: '' };

export default function MaterielPage() {
  const [items, setItems] = useState<Materiel[]>([]);
  const [ateliers, setAteliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Materiel | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: mat }, { data: refs }] = await Promise.all([
      supabase.from('materiel').select('*').order('atelier').order('nom'),
      supabase.from('recipe_sheets').select('atelier').eq('type', 'sous_recette').not('atelier', 'is', null),
    ]);
    setItems((mat as Materiel[]) ?? []);
    const uniqueAteliers = [...new Set((refs ?? []).map((r: any) => r.atelier).filter(Boolean))].sort();
    setAteliers(uniqueAteliers as string[]);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal(true);
  }

  function openEdit(m: Materiel) {
    setEditing(m);
    setForm({ nom: m.nom, capacite_kg: String(m.capacite_kg), atelier: m.atelier ?? '', notes: m.notes ?? '' });
    setModal(true);
  }

  async function save() {
    if (!form.nom.trim() || !form.capacite_kg) return;
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      capacite_kg: parseFloat(form.capacite_kg),
      atelier: form.atelier.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await supabase.from('materiel').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('materiel').insert(payload);
    }
    setSaving(false);
    setModal(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce matériel ?')) return;
    await supabase.from('materiel').delete().eq('id', id);
    load();
  }

  const byAtelier = items.reduce((acc, m) => {
    const key = m.atelier ?? 'Sans atelier';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, Materiel[]>);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/production" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Matériel de production</h1>
            <p className="text-sm text-gray-400">{items.length} équipement{items.length > 1 ? 's' : ''} · capacités de production</p>
          </div>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
          <Plus size={15} /> Nouveau matériel
        </button>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <Cpu className="mx-auto text-gray-200 mb-3" size={40} />
          <p className="text-gray-400 mb-4">Aucun matériel défini</p>
          <p className="text-sm text-gray-300 mb-6">Ajoutez vos équipements avec leur capacité max pour que le planning calcule automatiquement le nombre de fournées.</p>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <Plus size={15} /> Ajouter un équipement
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(byAtelier).map(([atelier, mats]) => (
            <div key={atelier}>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2 px-1">{atelier}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mats.map(m => (
                  <div key={m.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{m.nom}</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <p className="text-2xl font-black text-blue-600">{m.capacite_kg}</p>
                          <p className="text-sm text-gray-400">kg / fournée</p>
                        </div>
                        {m.notes && <p className="text-xs text-gray-400 mt-1 italic">{m.notes}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(m)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => remove(m.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50">
          <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">{editing ? 'Modifier le matériel' : 'Nouveau matériel'}</p>
              <button onClick={() => setModal(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nom de l'équipement</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="ex: Pétrin 1, Four 2…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Capacité max (kg / fournée)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={form.capacite_kg}
                  onChange={e => setForm(f => ({ ...f, capacite_kg: e.target.value }))}
                  placeholder="ex: 75"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Atelier</label>
                {ateliers.length > 0 ? (
                  <select
                    value={form.atelier}
                    onChange={e => setForm(f => ({ ...f, atelier: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option value="">— Tous les ateliers —</option>
                    {ateliers.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.atelier}
                    onChange={e => setForm(f => ({ ...f, atelier: e.target.value }))}
                    placeholder="ex: Boulangerie, Pâtisserie…"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Remarques optionnelles…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={save} disabled={saving || !form.nom.trim() || !form.capacite_kg}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
                <Check size={14} /> {saving ? 'Enregistrement…' : editing ? 'Modifier' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
