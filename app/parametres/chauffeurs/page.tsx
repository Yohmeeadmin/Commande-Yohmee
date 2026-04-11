'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Check, X, Trash2, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Driver, driverFullName } from '@/types';

interface DriverForm {
  first_name: string;
  last_name: string;
  phone: string;
}

const EMPTY_FORM: DriverForm = { first_name: '', last_name: '', phone: '' };

export default function ChauffeursPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<DriverForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadDrivers(); }, []);

  async function loadDrivers() {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .order('first_name');
    setDrivers(data || []);
    setLoading(false);
  }

  function startEdit(driver: Driver) {
    setEditingId(driver.id);
    setForm({ first_name: driver.first_name, last_name: driver.last_name, phone: driver.phone ?? '' });
  }

  function startNew() {
    setEditingId('new');
    setForm(EMPTY_FORM);
  }

  function cancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
      };

      if (editingId === 'new') {
        const { data } = await supabase.from('drivers').insert(payload).select().single();
        if (data) setDrivers(prev => [...prev, data].sort((a, b) => a.first_name.localeCompare(b.first_name)));
      } else {
        await supabase.from('drivers').update(payload).eq('id', editingId!);
        setDrivers(prev => prev.map(d => d.id === editingId ? { ...d, ...payload } : d));
      }
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(driver: Driver) {
    await supabase.from('drivers').update({ is_active: !driver.is_active }).eq('id', driver.id);
    setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, is_active: !d.is_active } : d));
  }

  async function remove(driver: Driver) {
    if (!confirm(`Supprimer ${driverFullName(driver)} ? Les commandes assignées seront désassignées.`)) return;
    await supabase.from('drivers').delete().eq('id', driver.id);
    setDrivers(prev => prev.filter(d => d.id !== driver.id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/parametres" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={22} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chauffeurs</h1>
          <p className="text-gray-500 text-sm mt-0.5">{drivers.filter(d => d.is_active).length} actif{drivers.filter(d => d.is_active).length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={startNew}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} /> Ajouter
        </button>
      </div>

      {/* Formulaire nouveau */}
      {editingId === 'new' && (
        <div className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
          <p className="font-semibold text-gray-800">Nouveau chauffeur</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Prénom *</label>
              <input
                autoFocus
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mohammed"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Nom *</label>
              <input
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Amrani"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Téléphone</label>
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+212 600 000 000"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={save}
              disabled={saving || !form.first_name.trim() || !form.last_name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Check size={16} /> Enregistrer
            </button>
            <button onClick={cancel} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">
              <X size={16} /> Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="space-y-2">
        {drivers.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
            Aucun chauffeur. Commencez par en ajouter un.
          </div>
        )}
        {drivers.map(driver => (
          <div key={driver.id} className={`bg-white rounded-2xl border p-4 transition-colors ${driver.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}>
            {editingId === driver.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    autoFocus
                    value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={form.last_name}
                    onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Téléphone"
                />
                <div className="flex gap-2">
                  <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    <Check size={14} /> Sauvegarder
                  </button>
                  <button onClick={cancel} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200">
                    <X size={14} /> Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-blue-700">
                    {driver.first_name.charAt(0)}{driver.last_name.charAt(0)}
                  </span>
                </div>
                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{driverFullName(driver)}</p>
                  {driver.phone && (
                    <p className="text-sm text-gray-400 flex items-center gap-1 mt-0.5">
                      <Phone size={12} /> {driver.phone}
                    </p>
                  )}
                </div>
                {/* Statut */}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${driver.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {driver.is_active ? 'Actif' : 'Inactif'}
                </span>
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(driver)} className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => toggleActive(driver)} className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title={driver.is_active ? 'Désactiver' : 'Activer'}>
                    {driver.is_active ? <X size={16} /> : <Check size={16} />}
                  </button>
                  <button onClick={() => remove(driver)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
