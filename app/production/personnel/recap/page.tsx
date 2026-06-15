'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Employe { id: string; nom: string; poste: string | null; service: string | null; heures_contrat: number | null; }
interface Shift { employe_id: string; date: string; heure_debut: string; heure_fin: string; pause_min: number; }
interface Absence { employe_id: string; date: string; type: string; }

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const ABSENCE_LABEL: Record<string, string> = { off: 'OFF', conge: 'CP', recup: 'REC', maladie: 'MAL', autre: 'ABS' };
const ABSENCE_COLOR: Record<string, string> = { off: 'bg-red-100 text-red-700', conge: 'bg-emerald-100 text-emerald-700', recup: 'bg-blue-100 text-blue-700', maladie: 'bg-red-100 text-red-700', autre: 'bg-gray-100 text-gray-600' };

function slotMin(s: Shift): number {
  const [dh, dm] = s.heure_debut.split(':').map(Number);
  const [fh, fm] = s.heure_fin.split(':').map(Number);
  let diff = (fh * 60 + fm) - (dh * 60 + dm);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - (s.pause_min ?? 0));
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60), mn = m % 60;
  return mn === 0 ? `${h}h` : `${h}h${String(mn).padStart(2, '0')}`;
}

function monthDates(year: number, month: number): string[] {
  const dates: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

export default function RecapMensuelPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [shifts, setShifts]     = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => { loadData(); }, [year, month]); // eslint-disable-line

  async function loadData() {
    setLoading(true);
    const dates = monthDates(year, month);
    const [{ data: emps }, { data: sh }, { data: abs }] = await Promise.all([
      supabase.from('rh_employes').select('id, nom, poste, service, heures_contrat').eq('actif', true).order('service').order('nom'),
      supabase.from('planning_shifts').select('employe_id, date, heure_debut, heure_fin, pause_min').in('date', dates),
      supabase.from('planning_absences').select('employe_id, date, type').in('date', dates),
    ]);
    setEmployes((emps ?? []) as Employe[]);
    setShifts((sh ?? []) as Shift[]);
    setAbsences((abs ?? []) as Absence[]);
    setLoading(false);
  }

  const services = useMemo(() => [...new Set(employes.map(e => e.service ?? 'Autre'))].sort(), [employes]);

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/production/personnel" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-black text-gray-900 flex-1">Récap mensuel</h1>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-2 py-1.5">
          <button onClick={prev} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 text-sm font-black text-gray-800">{MOIS[month]} {year}</span>
          <button onClick={next} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-gray-700 border-r-2 border-gray-200">Employé</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">Contrat</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">Planifié</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">Écart</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">Jours OFF</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">CP</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">Récup</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">Maladie</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700">Autre</th>
                <th className="text-center px-3 py-3 font-bold text-gray-700 border-l border-gray-100">Absences / détail</th>
              </tr>
            </thead>
            <tbody>
              {services.map(service => {
                const emps = employes.filter(e => (e.service ?? 'Autre') === service);
                return (
                  <>
                    <tr key={`svc-${service}`} className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={10} className="px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-500">{service}</td>
                    </tr>
                    {emps.map((emp, i) => {
                      const empShifts = shifts.filter(s => s.employe_id === emp.id);
                      const empAbs = absences.filter(a => a.employe_id === emp.id);
                      const totalMin = empShifts.reduce((sum, s) => sum + slotMin(s), 0);
                      // Nombre de semaines dans le mois (approximation : jours ouvrés / 5)
                      const dates = monthDates(year, month);
                      const nbSemaines = dates.filter(d => { const day = new Date(d).getDay(); return day >= 1 && day <= 5; }).length / 5;
                      const contratMin = Math.round((emp.heures_contrat ?? 35) * 60 * nbSemaines);
                      const ecart = totalMin - contratMin;
                      const countAbs = (type: string) => empAbs.filter(a => a.type === type).length;

                      return (
                        <tr key={emp.id} className={`border-b ${i === emps.length - 1 ? 'border-b-2 border-gray-200' : 'border-gray-100'} hover:bg-gray-50/50`}>
                          <td className="px-4 py-3 border-r-2 border-gray-200">
                            <p className="font-semibold text-gray-900">{emp.nom}</p>
                            {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                          </td>
                          <td className="text-center px-3 py-3 text-gray-500 text-xs">{(emp.heures_contrat ?? 35)}h/sem</td>
                          <td className="text-center px-3 py-3 font-bold text-gray-900">{totalMin > 0 ? fmtMin(totalMin) : '—'}</td>
                          <td className="text-center px-3 py-3 font-bold">
                            {totalMin > 0 ? (
                              <span className={ecart > 0 ? 'text-orange-600' : ecart < -30 ? 'text-red-500' : 'text-emerald-600'}>
                                {ecart >= 0 ? '+' : ''}{fmtMin(Math.abs(ecart))}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="text-center px-3 py-3">{countAbs('off') > 0 ? <span className="font-bold text-red-600">{countAbs('off')}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="text-center px-3 py-3">{countAbs('conge') > 0 ? <span className="font-bold text-emerald-600">{countAbs('conge')}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="text-center px-3 py-3">{countAbs('recup') > 0 ? <span className="font-bold text-blue-600">{countAbs('recup')}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="text-center px-3 py-3">{countAbs('maladie') > 0 ? <span className="font-bold text-red-600">{countAbs('maladie')}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="text-center px-3 py-3">{countAbs('autre') > 0 ? <span className="font-bold text-gray-600">{countAbs('autre')}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {empAbs.map((a, idx) => (
                                <span key={idx} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ABSENCE_COLOR[a.type] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {ABSENCE_LABEL[a.type] ?? a.type}
                                </span>
                              ))}
                              {empAbs.length === 0 && <span className="text-xs text-gray-300">Aucune</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
