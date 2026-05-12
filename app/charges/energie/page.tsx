'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

const TYPES = [
  { key: 'electricite', label: 'Électricité', icon: '⚡', color: 'text-yellow-600 bg-yellow-50' },
  { key: 'eau',         label: 'Eau',         icon: '💧', color: 'text-blue-600 bg-blue-50' },
  { key: 'gaz',         label: 'Gaz',         icon: '🔥', color: 'text-orange-600 bg-orange-50' },
  { key: 'telephone',   label: 'Téléphone / Internet', icon: '📡', color: 'text-purple-600 bg-purple-50' },
  { key: 'autre',       label: 'Autre fluide', icon: '🔌', color: 'text-gray-600 bg-gray-100' },
];

interface Ligne {
  type: string;
  montant: number;
  notes: string;
}

function getCurrentMois(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMois(mois: string): string {
  const [y, m] = mois.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function fmt(n: number) {
  return n.toLocaleString('fr-MA', { maximumFractionDigits: 0 }) + ' MAD';
}

export default function ChargesEnergiePage() {
  const [mois, setMois] = useState(getCurrentMois());
  const [lignes, setLignes] = useState<Map<string, Ligne>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('charges_energie').select('*').eq('mois', mois);
    const map = new Map<string, Ligne>();
    ((data as { type: string; montant: number; notes: string }[]) || []).forEach(r =>
      map.set(r.type, { type: r.type, montant: r.montant, notes: r.notes || '' })
    );
    setLignes(map);
    setLoading(false);
  }, [mois]);

  useEffect(() => { load(); }, [load]);

  async function saveLigne(type: string, montant: number, notes: string) {
    setSaving(type);
    const prev = lignes.get(type);
    const newLigne = { type, montant, notes };
    setLignes(m => new Map(m).set(type, newLigne));
    if (prev || montant > 0) {
      await supabase.from('charges_energie').upsert(
        { mois, type, montant, notes },
        { onConflict: 'mois,type' }
      );
    }
    setSaving(null);
  }

  const total = Array.from(lignes.values()).reduce((s, l) => s + (l.montant || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-none">Énergie & Fluides</h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">{formatMois(mois)}</p>
        </div>
        <input type="month" value={mois} onChange={e => setMois(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:border-blue-400" />
      </div>

      {/* KPI */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Total énergie & fluides</p>
        <p className="text-xl font-black text-blue-600">{fmt(total)}</p>
      </div>

      {/* Lignes par type */}
      {loading ? (
        <div className="flex items-center justify-center h-40 bg-white rounded-2xl border border-gray-100">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {TYPES.map(t => {
            const ligne = lignes.get(t.key) ?? { type: t.key, montant: 0, notes: '' };
            return (
              <div key={t.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${t.color}`}>
                    {t.icon}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{t.label}</p>
                  {saving === t.key && <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin ml-auto" />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Montant (MAD)</label>
                    <input
                      type="number"
                      defaultValue={ligne.montant || ''}
                      onBlur={e => saveLigne(t.key, Number(e.target.value) || 0, ligne.notes)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:border-blue-400"
                      placeholder="0"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                    <input
                      type="text"
                      defaultValue={ligne.notes}
                      onBlur={e => saveLigne(t.key, ligne.montant, e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      placeholder="Ex : 850 kWh"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
