'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getFerieFromList, JourFerie } from '@/lib/feries-maroc';

interface Employe { id: string; nom: string; poste: string | null; service: string | null; }
interface Shift { employe_id: string; date: string; heure_debut: string; heure_fin: string; pause_min: number; }
interface Pointage { employe_id: string; date: string; heure_entree: string | null; heure_sortie: string | null; pause_min: number; note: string | null; }
interface AbsenceRow { employe_id: string; date: string; type: string; }

type AbsenceType = 'off' | 'conge' | 'recup' | 'maladie' | 'autre';

const ABSENCE_TYPES: { key: AbsenceType; short: string; label: string; badge: string; pill: string; cell: string }[] = [
  { key: 'off',     short: 'OFF', label: 'Jour off',       badge: 'bg-red-600 text-white',           pill: 'bg-red-600 text-white hover:bg-red-700',                cell: 'bg-red-50' },
  { key: 'conge',   short: 'CP',  label: 'Congé payé',     badge: 'bg-emerald-100 text-emerald-800', pill: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',  cell: 'bg-emerald-50' },
  { key: 'recup',   short: 'REC', label: 'Récupération',   badge: 'bg-blue-100 text-blue-800',       pill: 'bg-blue-100 text-blue-700 hover:bg-blue-200',           cell: 'bg-blue-50' },
  { key: 'maladie', short: 'MAL', label: 'Maladie',        badge: 'bg-red-100 text-red-800',         pill: 'bg-red-100 text-red-700 hover:bg-red-200',              cell: 'bg-red-50' },
  { key: 'autre',   short: 'ABS', label: 'Autre absence',  badge: 'bg-gray-100 text-gray-700',       pill: 'bg-gray-100 text-gray-600 hover:bg-gray-200',           cell: 'bg-gray-50' },
];
function absenceConf(type: string) { return ABSENCE_TYPES.find(a => a.key === type) ?? ABSENCE_TYPES[4]; }

const JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

function getMondayOf(d: Date): Date {
  const day = d.getDay(), diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0); return m;
}
function weekDatesOf(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().split('T')[0];
  });
}
function fmtDay(d: Date) { return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
function getISOWeek(d: Date): number {
  const t = new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7);
  const w = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - w.getTime()) / 86400000 - 3 + (w.getDay() + 6) % 7) / 7);
}
function fmtMin(m: number): string {
  const h = Math.floor(m / 60), mn = m % 60;
  return mn === 0 ? `${h}h` : `${h}h${String(mn).padStart(2,'0')}`;
}
function netMin(debut: string, fin: string, pause: number): number {
  if (!debut || !fin) return 0;
  const [dh, dm] = debut.split(':').map(Number), [fh, fm] = fin.split(':').map(Number);
  let diff = (fh * 60 + fm) - (dh * 60 + dm);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - pause);
}
function shiftMin(s: Shift): number { return netMin(s.heure_debut, s.heure_fin, s.pause_min); }

export default function PointagesPage() {
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOf(new Date()));
  const [employes, setEmployes]     = useState<Employe[]>([]);
  const [shifts, setShifts]         = useState<Shift[]>([]);
  const [pointages, setPointages]   = useState<Record<string, Pointage>>({});
  const [absences, setAbsences]     = useState<Record<string, AbsenceType>>({});
  const [editing, setEditing]       = useState<Record<string, Pointage>>({});
  const [saving, setSaving]         = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [feries, setFeries]         = useState<JourFerie[]>([]);

  useEffect(() => {
    supabase.from('rh_employes').select('id, nom, poste, service').eq('actif', true).order('service').order('nom')
      .then((res: { data: Employe[] | null }) => setEmployes(res.data ?? []));
    supabase.from('jours_feries').select('*').then(({ data }) => setFeries((data ?? []) as JourFerie[]));
  }, []);

  useEffect(() => { loadWeek(); }, [weekMonday]); // eslint-disable-line

  async function loadWeek() {
    setLoading(true);
    const dates = weekDatesOf(weekMonday);
    const [{ data: sh }, { data: pt }, { data: abs }] = await Promise.all([
      supabase.from('planning_shifts').select('*').in('date', dates),
      supabase.from('pointages').select('*').in('date', dates),
      supabase.from('planning_absences').select('employe_id, date, type').in('date', dates),
    ]);
    setShifts((sh ?? []) as Shift[]);
    const ptMap: Record<string, Pointage> = {};
    ((pt ?? []) as Pointage[]).forEach(p => { ptMap[`${p.employe_id}_${p.date}`] = p; });
    setPointages(ptMap);
    const absMap: Record<string, AbsenceType> = {};
    ((abs ?? []) as AbsenceRow[]).forEach(a => { absMap[`${a.employe_id}_${a.date}`] = a.type as AbsenceType; });
    setAbsences(absMap);
    setEditing({});
    setLoading(false);
  }

  const dates = useMemo(() => weekDatesOf(weekMonday), [weekMonday]);

  function getShift(empId: string, date: string): Shift | undefined {
    return shifts.find(s => s.employe_id === empId && s.date === date);
  }
  function getPointage(empId: string, date: string): Pointage | undefined {
    const key = `${empId}_${date}`;
    return editing[key] ?? pointages[key];
  }
  function editPointage(empId: string, date: string, patch: Partial<Pointage>) {
    const key = `${empId}_${date}`;
    const base = pointages[key] ?? { employe_id: empId, date, heure_entree: null, heure_sortie: null, pause_min: 0, note: null };
    setEditing(prev => ({ ...prev, [key]: { ...base, ...editing[key], ...patch } }));
  }
  async function savePointage(empId: string, date: string) {
    const key = `${empId}_${date}`;
    const p = editing[key]; if (!p) return;
    setSaving(key);
    await supabase.from('pointages').upsert({ ...p, employe_id: empId, date }, { onConflict: 'employe_id,date' });
    setPointages(prev => ({ ...prev, [key]: p }));
    setEditing(prev => { const n = { ...prev }; delete n[key]; return n; });
    setSaving(null);
  }

  async function setAbsenceForDay(empId: string, date: string, type: AbsenceType | null) {
    const key = `${empId}_${date}`;
    if (type === null) {
      await supabase.from('planning_absences').delete().eq('employe_id', empId).eq('date', date);
      setAbsences(prev => { const n = { ...prev }; delete n[key]; return n; });
    } else {
      await supabase.from('planning_absences').upsert({ employe_id: empId, date, type }, { onConflict: 'employe_id,date' });
      setAbsences(prev => ({ ...prev, [key]: type }));
    }
  }

  const services = useMemo(() => [...new Set(employes.map(e => e.service ?? 'Autre'))].sort(), [employes]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/production/personnel" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-black text-gray-900 flex-1">Pointages</h1>

        {/* Légende */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ABSENCE_TYPES.map(at => (
            <span key={at.key} className={`text-[10px] font-bold px-2 py-1 rounded-lg ${at.badge}`}>{at.label}</span>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-2 py-1.5">
          <button onClick={() => setWeekMonday(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg font-bold transition-colors">‹</button>
          <span className="px-3 text-sm font-black text-gray-800">S{getISOWeek(weekMonday)} — {fmtDay(weekMonday)}</span>
          <button onClick={() => setWeekMonday(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg font-bold transition-colors">›</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="space-y-4">
          {services.map(service => {
            const emps = employes.filter(e => (e.service ?? 'Autre') === service);
            return (
              <div key={service} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-500">{service}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2 font-bold text-gray-600 border-r border-gray-200 w-36">Employé</th>
                        {dates.map((date, i) => {
                          const ferie = getFerieFromList(date, feries);
                          return (
                            <th key={date} className={`text-center px-2 py-2 font-bold border-r border-gray-100 last:border-r-0 ${ferie ? 'bg-green-100 text-green-700' : i >= 5 ? 'bg-gray-100 text-gray-600' : 'text-gray-600'}`}>
                              <p>{JOURS[i]}</p>
                              <p className="text-xs font-normal" style={{ color: ferie ? '#15803d' : '#9ca3af' }}>{fmtDay(new Date(date))}</p>
                              {ferie && <p className="text-[9px] font-semibold text-green-600 leading-tight max-w-[80px] mx-auto normal-case">{ferie}</p>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {emps.map((emp, eIdx) => (
                        <tr key={emp.id} className={`border-b ${eIdx === emps.length - 1 ? 'border-b-0' : 'border-gray-100'}`}>
                          <td className="px-4 py-2 border-r border-gray-200">
                            <p className="font-semibold text-gray-900 text-sm">{emp.nom}</p>
                            {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                          </td>
                          {dates.map((date, di) => {
                            const shift = getShift(emp.id, date);
                            const pt = getPointage(emp.id, date);
                            const absKey = `${emp.id}_${date}`;
                            const absence = absences[absKey];
                            const ptKey = `${emp.id}_${date}`;
                            const isDirty = !!editing[ptKey];
                            const realMin = pt?.heure_entree && pt?.heure_sortie ? netMin(pt.heure_entree, pt.heure_sortie, pt.pause_min ?? 0) : 0;
                            const plannedMin = shift ? shiftMin(shift) : 0;
                            const diff = realMin - plannedMin;
                            const ac = absence ? absenceConf(absence) : null;

                            return (
                              <td key={date} className={`px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 align-top ${di >= 5 ? 'bg-gray-50' : ''} ${ac ? ac.cell : ''}`}>
                                {/* Absence */}
                                {ac ? (
                                  <div className="flex flex-col gap-1 min-h-[4rem]">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg flex-1 text-center ${ac.badge}`}>{ac.label}</span>
                                      <button onClick={() => setAbsenceForDay(emp.id, date, null)}
                                        className="p-0.5 text-gray-400 hover:text-red-500 transition-colors rounded shrink-0"
                                        title="Retirer">
                                        <X size={10} />
                                      </button>
                                    </div>
                                  </div>
                                ) : shift ? (
                                  /* Shift planifié → pointage + pills absence */
                                  <div className="space-y-1">
                                    <p className="text-[9px] text-gray-400 font-semibold">{shift.heure_debut.slice(0,5)}–{shift.heure_fin.slice(0,5)}</p>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-gray-400 w-7">Ent.</span>
                                      <input type="time" value={pt?.heure_entree ?? ''}
                                        onChange={e => editPointage(emp.id, date, { heure_entree: e.target.value || null })}
                                        className="text-[11px] border border-gray-200 rounded-lg px-1 py-0.5 w-full focus:outline-none focus:border-amber-400 bg-white" />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-gray-400 w-7">Sort.</span>
                                      <input type="time" value={pt?.heure_sortie ?? ''}
                                        onChange={e => editPointage(emp.id, date, { heure_sortie: e.target.value || null })}
                                        className="text-[11px] border border-gray-200 rounded-lg px-1 py-0.5 w-full focus:outline-none focus:border-amber-400 bg-white" />
                                    </div>
                                    {realMin > 0 && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-gray-700">{fmtMin(realMin)}</span>
                                        {Math.abs(diff) > 15 && (
                                          <span className={`text-[9px] font-bold ${diff > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                                            {diff > 0 ? '+' : ''}{fmtMin(Math.abs(diff))}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {isDirty && (
                                      <button onClick={() => savePointage(emp.id, date)} disabled={saving === ptKey}
                                        className="w-full flex items-center justify-center gap-1 text-[9px] font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg py-0.5 transition-colors disabled:opacity-50">
                                        <Save size={8} /> {saving === ptKey ? '…' : 'Sauver'}
                                      </button>
                                    )}
                                    {/* Pills absence sous les inputs */}
                                    <div className="flex gap-0.5 pt-0.5 border-t border-gray-100">
                                      {ABSENCE_TYPES.map(at => (
                                        <button key={at.key} title={at.label}
                                          onClick={() => setAbsenceForDay(emp.id, date, at.key)}
                                          className={`flex-1 text-[8px] font-black py-0.5 rounded transition-colors ${at.pill}`}>
                                          {at.short}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  /* Pas de shift → pills absence uniquement */
                                  <div className="flex gap-0.5 min-h-[4rem] items-end">
                                    {ABSENCE_TYPES.map(at => (
                                      <button key={at.key} title={at.label}
                                        onClick={() => setAbsenceForDay(emp.id, date, at.key)}
                                        className={`flex-1 text-[8px] font-black py-1 rounded transition-colors ${at.pill}`}>
                                        {at.short}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
