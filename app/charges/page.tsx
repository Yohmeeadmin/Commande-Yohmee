'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Users, Lock, Zap, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

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

const MODULES = [
  { href: '/charges/rh',        icon: Users,        label: 'Ressources humaines', desc: 'Masse salariale par employé', color: 'bg-blue-50 text-blue-600' },
  { href: '/charges/fixes',     icon: Lock,         label: 'Charges fixes',       desc: 'Loyer, assurances, leasing…', color: 'bg-purple-50 text-purple-600' },
  { href: '/charges/energie',   icon: Zap,          label: 'Énergie & Fluides',   desc: 'Électricité, eau, gaz…',     color: 'bg-yellow-50 text-yellow-600' },
  { href: '/charges/variables', icon: TrendingDown, label: 'Charges variables',   desc: 'Réparations, divers…',       color: 'bg-orange-50 text-orange-600' },
];

export default function ChargesPage() {
  const [mois, setMois] = useState(getCurrentMois());
  const [totaux, setTotaux] = useState({ rh: 0, fixes: 0, energie: 0, variables: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data: presences }, { data: employes }, { data: fixes }, { data: energie }, { data: variables }] = await Promise.all([
      supabase.from('rh_presences').select('employe_id, jours_travailles, prime').eq('mois', mois),
      supabase.from('rh_employes').select('id, salaire_mensuel').eq('actif', true),
      supabase.from('charges_fixes').select('montant').eq('actif', true),
      supabase.from('charges_energie').select('montant').eq('mois', mois),
      supabase.from('charges_variables').select('montant').eq('mois', mois),
    ]);

    // RH : taux jour × jours + primes
    const empMap = new Map<string, number>();
    ((employes as { id: string; salaire_mensuel: number }[]) || []).forEach(e => empMap.set(e.id, e.salaire_mensuel));
    const rhTotal = ((presences as { employe_id: string; jours_travailles: number; prime: number }[]) || []).reduce((s, p) => {
      const brut = empMap.get(p.employe_id) ?? 0;
      return s + (brut / 26) * (p.jours_travailles || 0) + (p.prime || 0);
    }, 0);

    // Pour les employés sans présence enregistrée : salaire complet (26j)
    const presenceIds = new Set(((presences as { employe_id: string }[]) || []).map(p => p.employe_id));
    const rhSansPresence = ((employes as { id: string; salaire_mensuel: number }[]) || [])
      .filter(e => !presenceIds.has(e.id))
      .reduce((s, e) => s + e.salaire_mensuel, 0);

    setTotaux({
      rh: rhTotal + rhSansPresence,
      fixes: ((fixes as { montant: number }[]) || []).reduce((s, f) => s + f.montant, 0),
      energie: ((energie as { montant: number }[]) || []).reduce((s, e) => s + e.montant, 0),
      variables: ((variables as { montant: number }[]) || []).reduce((s, v) => s + v.montant, 0),
    });
    setLoading(false);
  }, [mois]);

  useEffect(() => { load(); }, [load]);

  const total = totaux.rh + totaux.fixes + totaux.energie + totaux.variables;

  const blocs = [
    { label: 'RH', value: totaux.rh, pct: total > 0 ? (totaux.rh / total) * 100 : 0, bar: 'bg-blue-500' },
    { label: 'Fixes', value: totaux.fixes, pct: total > 0 ? (totaux.fixes / total) * 100 : 0, bar: 'bg-purple-500' },
    { label: 'Énergie', value: totaux.energie, pct: total > 0 ? (totaux.energie / total) * 100 : 0, bar: 'bg-yellow-500' },
    { label: 'Variables', value: totaux.variables, pct: total > 0 ? (totaux.variables / total) * 100 : 0, bar: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-none">Charges</h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">{formatMois(mois)}</p>
        </div>
        <input type="month" value={mois} onChange={e => setMois(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:border-blue-400" />
      </div>

      {/* Total + répartition */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-800">Total charges du mois</p>
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          ) : (
            <p className="text-2xl font-black text-gray-900">{fmt(total)}</p>
          )}
        </div>
        <div className="space-y-3">
          {blocs.map(b => (
            <div key={b.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">{b.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-400">{b.pct.toFixed(0)}%</span>
                  <span className="text-sm font-bold text-gray-900 w-28 text-right">{fmt(b.value)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${b.bar} rounded-full transition-all duration-700`} style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modules */}
      <div className="grid sm:grid-cols-2 gap-4">
        {MODULES.map(m => {
          const Icon = m.icon;
          return (
            <Link key={m.href} href={m.href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98]">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${m.color}`}>
                <Icon size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{m.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
              </div>
              {!loading && (
                <p className="text-sm font-black text-gray-700 shrink-0">
                  {fmt(m.label === 'Ressources humaines' ? totaux.rh :
                       m.label === 'Charges fixes' ? totaux.fixes :
                       m.label === 'Énergie & Fluides' ? totaux.energie : totaux.variables)}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
