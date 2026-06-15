'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, X, Check, Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Poste {
  id: string;
  nom: string;
  type: 'machine' | 'humain';
  capacite_simultanee: number;
  notes: string | null;
}

const EMPTY_FORM = { nom: '', type: 'machine' as 'machine' | 'humain', capacite_simultanee: '1', notes: '' };

const TYPE_LABELS: Record<string, string> = { machine: 'Machine', humain: 'Poste humain' };
const TYPE_COLORS: Record<string, string> = {
  machine: 'bg-blue-50 text-blue-700',
  humain:  'bg-emerald-50 text-emerald-700',
};

export default function PostesPage() {
  const [items, setItems]   = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState<Poste | null>(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('postes').select('*').order('nom');
    setItems((data as Poste[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal(true);
  }

  function openEdit(p: Poste) {
    setEditing(p);
    setForm({ nom: p.nom, type: p.type, capacite_simultanee: String(p.capacite_simultanee), notes: p.notes ?? '' });
    setModal(true);
  }

  async function save() {
    if (!form.nom.trim()) return;
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      type: form.type,
      capacite_simultanee: parseInt(form.capacite_simultanee) || 1,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await supabase.from('postes').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('postes').insert(payload);
    }
    setSaving(false);
    setModal(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce poste ? Les étapes de recette liées seront désassociées.')) return;
    await supabase.from('postes').delete().eq('id', id);
    load();
  }

  const machines = items.filter(p => p.type === 'machine');
  const humains  = items.filter(p => p.type === 'humain');

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/production" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Postes de travail</h1>
            <p className="text-sm text-gray-400">Machines et stations de production</p>
          </div>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">
          <Plus size={16} /> Ajouter un poste
        </button>
      </div>

      {/* KPIs */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total postes</p>
            <p className="text-3xl font-black text-gray-900">{items.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Machines</p>
            <p className="text-3xl font-black text-blue-600">{machines.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Postes humains</p>
            <p className="text-3xl font-black text-emerald-600">{humains.length}</p>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Layers size={28} className="text-gray-400" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Aucun poste</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
            Définissez vos postes de travail (pétrin, four, façonnage…) pour calculer les temps de production.
          </p>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
            <Plus size={15} /> Ajouter un poste
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-sm transition-all">
              <div className={`h-1 ${p.type === 'machine' ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.type === 'machine' ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                      <Layers size={20} className={p.type === 'machine' ? 'text-blue-600' : 'text-emerald-600'} />
                    </div>
                    <div>
                      <p className="font-black text-gray-900 leading-tight">{p.nom}</p>
                      {p.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{p.notes}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(p)}
                      className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(p.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${TYPE_COLORS[p.type]}`}>
                    {TYPE_LABELS[p.type]}
                  </span>
                  {p.capacite_simultanee > 1 && (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                      {p.capacite_simultanee} tâches simultanées
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full sm:max-w-lg rounded-2xl shadow-2xl">

            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <p className="font-black text-gray-900 text-lg">{editing ? 'Modifier le poste' : 'Nouveau poste'}</p>
                <p className="text-sm text-gray-400 mt-0.5">Machine ou station de travail</p>
              </div>
              <button onClick={() => setModal(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">

              {/* Nom */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Nom du poste</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="ex : Pétrin 100kg, Four 1, Façonnage…"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Type</label>
                <div className="flex gap-3">
                  {(['machine', 'humain'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                        form.type === t
                          ? t === 'machine' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {form.type === 'machine'
                    ? 'Pétrin, four, chambre de pousse — 1 tâche à la fois par défaut'
                    : 'Façonnage, emballage — plusieurs personnes peuvent travailler en parallèle'}
                </p>
              </div>

              {/* Capacité simultanée */}
              {form.type === 'humain' && (
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                    Nombre de personnes simultanées max
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.capacite_simultanee}
                    onChange={e => setForm(f => ({ ...f, capacite_simultanee: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Notes (optionnel)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Marque, particularités…"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setModal(false)}
                className="flex-1 px-4 py-3 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button
                onClick={save}
                disabled={saving || !form.nom.trim()}
                className="flex-1 px-4 py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enregistrement…</>
                ) : (
                  <><Check size={15} /> {editing ? 'Enregistrer' : 'Créer le poste'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
