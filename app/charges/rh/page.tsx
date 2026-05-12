'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { TableRowSkeleton } from '@/components/ui/Skeleton';

const JOURS_BASE = 26;

const SERVICES = [
  'Administration',
  'Commercial',
  'Livraison',
  'Boulangerie',
  'Pâtisserie',
  'Chocolaterie',
  'Viennoiserie',
  'Burger',
  'Production',
  'Autre',
];

interface Employe {
  id: string;
  nom: string;
  poste: string | null;
  service: string | null;
  salaire_mensuel: number;
  actif: boolean;
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

// ── Calcul IGR (barème mensuel Maroc 2024) ─────────────────────────────────

function calcIGR(netImposable: number): number {
  if (netImposable <= 2500) return 0;
  if (netImposable <= 4166) return (netImposable - 2500) * 0.10;
  if (netImposable <= 5000) return 166.6 + (netImposable - 4166) * 0.20;
  if (netImposable <= 6666) return 333.4 + (netImposable - 5000) * 0.30;
  if (netImposable <= 15000) return 833.2 + (netImposable - 6666) * 0.34;
  return 3666.76 + (netImposable - 15000) * 0.38;
}

function calcNetFromBrut(brut: number): number {
  const cnss = (4.48 / 100) * Math.min(brut, 6000);
  const amo  = (2.26 / 100) * brut;
  const fraisPro = Math.min(0.20 * brut, 2500);
  const netImposable = Math.max(0, brut - cnss - amo - fraisPro);
  const igr = calcIGR(netImposable);
  return Math.round(brut - cnss - amo - igr);
}

function calcBrutFromNet(net: number): number {
  // Recherche binaire
  let lo = net;
  let hi = net * 2.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (calcNetFromBrut(mid) < net) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ChargesRHPage() {
  const [mois, setMois] = useState(getCurrentMois());
  const [presences, setPresences] = useState<Map<string, { jours: number; prime: number }>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<Employe | null>(null);
  const [form, setForm] = useState({ nom: '', poste: '', service: '', brut: '', net: '' });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: employes = [], isLoading: loading } = useQuery({
    queryKey: ['rh-employes'],
    queryFn: async () => {
      const { data } = await supabase.from('rh_employes').select('*').eq('actif', true).order('nom');
      return (data as Employe[]) || [];
    },
    staleTime: 1000 * 60 * 5, // 5 min
  });

  // Presences rechargées à chaque changement de mois
  useEffect(() => {
    supabase.from('rh_presences').select('employe_id, jours_travailles, prime').eq('mois', mois).then(({ data }: { data: { employe_id: string; jours_travailles: number; prime: number }[] | null }) => {
      const map = new Map<string, { jours: number; prime: number }>();
      ((data as { employe_id: string; jours_travailles: number; prime: number }[]) || []).forEach(p =>
        map.set(p.employe_id, { jours: p.jours_travailles, prime: p.prime ?? 0 })
      );
      setPresences(map);
    });
  }, [mois]);

  async function saveJours(empId: string, val: string) {
    const jours = val === '' ? 0 : Math.max(0, Math.min(31, Number(val)));
    const prev = presences.get(empId) ?? { jours: JOURS_BASE, prime: 0 };
    setPresences(p => new Map(p).set(empId, { ...prev, jours }));
    await supabase.from('rh_presences').upsert(
      { employe_id: empId, mois, jours_travailles: jours, prime: prev.prime },
      { onConflict: 'employe_id,mois' }
    );
  }

  async function savePrime(empId: string, val: string) {
    const prime = val === '' ? 0 : Math.max(0, Number(val));
    const prev = presences.get(empId) ?? { jours: JOURS_BASE, prime: 0 };
    setPresences(p => new Map(p).set(empId, { ...prev, prime }));
    await supabase.from('rh_presences').upsert(
      { employe_id: empId, mois, jours_travailles: prev.jours, prime },
      { onConflict: 'employe_id,mois' }
    );
  }

  function openNew() {
    setEditEmp(null);
    setForm({ nom: '', poste: '', service: '', brut: '', net: '' });
    setModalOpen(true);
  }

  function openEdit(emp: Employe) {
    setEditEmp(emp);
    const brut = emp.salaire_mensuel;
    const net = calcNetFromBrut(brut);
    setForm({ nom: emp.nom, poste: emp.poste || '', service: emp.service || '', brut: String(brut), net: String(net) });
    setModalOpen(true);
  }

  function onBrutChange(val: string) {
    const brut = Number(val);
    const net = val && brut > 0 ? String(calcNetFromBrut(brut)) : '';
    setForm(f => ({ ...f, brut: val, net }));
  }

  function onNetChange(val: string) {
    const net = Number(val);
    const brut = val && net > 0 ? String(calcBrutFromNet(net)) : '';
    setForm(f => ({ ...f, net: val, brut }));
  }

  async function saveEmploye() {
    if (!form.nom.trim() || !form.brut) return;
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      poste: form.poste.trim() || null,
      service: form.service || null,
      salaire_mensuel: Number(form.brut),
    };
    if (editEmp) {
      await supabase.from('rh_employes').update(payload).eq('id', editEmp.id);
    } else {
      await supabase.from('rh_employes').insert({ ...payload, actif: true });
    }
    setSaving(false);
    setModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ['rh-employes'] });
  }

  async function deleteEmploye(id: string) {
    if (!confirm('Archiver cet employé ?')) return;
    await supabase.from('rh_employes').update({ actif: false }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['rh-employes'] });
  }

  // Calculs tableau
  const rows = employes.map(emp => {
    const brut = emp.salaire_mensuel;
    const net = calcNetFromBrut(brut);
    const tauxJour = brut / JOURS_BASE;
    const pres = presences.get(emp.id) ?? { jours: JOURS_BASE, prime: 0 };
    const salaireMois = tauxJour * pres.jours;
    const coutMois = salaireMois + pres.prime;
    return { emp, brut, net, tauxJour, jours: pres.jours, prime: pres.prime, salaireMois, coutMois };
  });

  const totalMensuel = rows.reduce((s, r) => s + r.coutMois, 0);
  const totalPrimes = rows.reduce((s, r) => s + r.prime, 0);
  const totalJours = rows.reduce((s, r) => s + r.jours, 0);
  const coutJourMoyen = totalJours > 0 ? totalMensuel / totalJours : 0;

  // Répartition par service
  const byService = new Map<string, { cout: number; nb: number }>();
  rows.forEach(r => {
    const key = r.emp.service || 'Non assigné';
    const prev = byService.get(key) ?? { cout: 0, nb: 0 };
    byService.set(key, { cout: prev.cout + r.coutMois, nb: prev.nb + 1 });
  });
  const serviceRows = Array.from(byService.entries()).sort((a, b) => b[1].cout - a[1].cout);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-none">Charges RH</h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">{formatMois(mois)}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mois}
            onChange={e => setMois(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
          >
            <Plus size={16} />
            Employé
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1.5">Employés actifs</p>
          <p className="text-2xl font-black text-gray-900">{employes.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1.5">Masse salariale (brut)</p>
          <p className="text-xl font-black text-blue-600 leading-none">{fmt(totalMensuel)}</p>
          <p className="text-[11px] text-gray-300 mt-1.5">{totalJours} jours travaillés</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1.5">Coût / jour</p>
          <p className="text-xl font-black text-gray-900 leading-none">{coutJourMoyen > 0 ? fmt(coutJourMoyen) : '—'}</p>
          <p className="text-[11px] text-gray-300 mt-1.5">toute équipe confondue</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1.5">Base de calcul</p>
          <p className="text-2xl font-black text-gray-900">{JOURS_BASE}j</p>
          <p className="text-[11px] text-gray-300 mt-1.5">jours ouvrables / mois</p>
        </div>
      </div>

      {/* Répartition par service */}
      {serviceRows.length > 0 && totalMensuel > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">Masse salariale par service</p>
          <div className="space-y-3">
            {serviceRows.map(([service, { cout, nb }]) => {
              const pct = totalMensuel > 0 ? Math.round((cout / totalMensuel) * 100) : 0;
              return (
                <div key={service}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{service}</span>
                      <span className="text-xs text-gray-300">{nb} employé{nb > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500">{pct}%</span>
                      <span className="text-sm font-bold text-gray-900 w-28 text-right">{fmt(cout)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)}
          </div>
        ) : employes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-gray-300 mb-3">Aucun employé</p>
            <button onClick={openNew} className="text-sm text-blue-600 font-semibold">+ Ajouter un employé</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Employé</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Service</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Brut / mois</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Net / mois</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Taux / jour</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Jours</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Prime</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Coût mois</th>
                  <th className="w-16 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(({ emp, brut, net, tauxJour, jours, prime, coutMois }) => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">{emp.nom}</p>
                      {emp.poste && <p className="text-xs text-gray-400 mt-0.5">{emp.poste}</p>}
                    </td>
                    <td className="px-4 py-4">
                      {emp.service ? (
                        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">{emp.service}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-medium text-gray-700">
                      {brut.toLocaleString('fr-MA')} MAD
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-gray-400">
                      {net.toLocaleString('fr-MA')} MAD
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-gray-400">
                      {tauxJour.toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          value={jours || ''}
                          onChange={e => saveJours(emp.id, e.target.value)}
                          min={0} max={31} step={0.5}
                          placeholder={String(JOURS_BASE)}
                          className="w-16 text-center text-sm font-semibold border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          value={prime || ''}
                          onChange={e => savePrime(emp.id, e.target.value)}
                          min={0} step={50}
                          placeholder="0"
                          className="w-24 text-center text-sm font-semibold border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400 text-amber-700"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={`text-sm font-black ${coutMois > 0 ? 'text-gray-900' : 'text-gray-200'}`}>
                        {coutMois > 0 ? fmt(coutMois) : '—'}
                      </span>
                      {prime > 0 && (
                        <p className="text-[11px] text-amber-500 mt-0.5">dont {fmt(prime)} prime</p>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(emp)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteEmploye(emp.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-100 bg-gray-50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-700">Total</td>
                    <td /><td /><td />
                    <td className="px-4 py-3 text-center text-sm font-bold text-amber-600">{totalPrimes > 0 ? fmt(totalPrimes) : '—'}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-700">{totalJours}j</td>
                    <td className="px-5 py-3 text-right text-sm font-black text-blue-600">{fmt(totalMensuel)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Modal employé */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setModalOpen(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-xl p-5 max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-5">
              <p className="font-semibold text-gray-900 text-base">
                {editEmp ? "Modifier l'employé" : 'Nouvel employé'}
              </p>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Nom complet *</label>
                <input
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                  placeholder="Prénom Nom"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Poste</label>
                  <input
                    value={form.poste}
                    onChange={e => setForm(f => ({ ...f, poste: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                    placeholder="Pâtissier…"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Service</label>
                  <select
                    value={form.service}
                    onChange={e => setForm(f => ({ ...f, service: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">— Choisir</option>
                    {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Salaire brut / net bidirectionnel */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Salaire mensuel</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Net à payer (MAD)</label>
                    <input
                      type="number"
                      value={form.net}
                      onChange={e => onNetChange(e.target.value)}
                      className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-blue-400"
                      placeholder="3 200"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Brut (MAD)</label>
                    <input
                      type="number"
                      value={form.brut}
                      onChange={e => onBrutChange(e.target.value)}
                      className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-blue-400"
                      placeholder="3 800"
                      min={0}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Calcul basé sur CNSS + AMO + IGR (barème Maroc 2024)
                </p>
              </div>
            </div>

            <button
              onClick={saveEmploye}
              disabled={saving || !form.nom.trim() || !form.brut}
              className="mt-5 w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
