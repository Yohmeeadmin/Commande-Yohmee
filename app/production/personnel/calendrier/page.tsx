'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getFerieFromList, JourFerie } from '@/lib/feries-maroc';

interface Employe { id: string; nom: string; poste: string | null; service: string | null; }
interface Shift { employe_id: string; date: string; heure_debut: string; heure_fin: string; pause_min: number; }
interface Absence { employe_id: string; date: string; type: string; }

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const ABS_STYLE: Record<string, string> = {
  off:     'bg-red-500 text-white',
  conge:   'bg-emerald-500 text-white',
  recup:   'bg-blue-500 text-white',
  maladie: 'bg-red-300 text-white',
  autre:   'bg-gray-400 text-white',
};
const ABS_LABEL: Record<string, string> = { off: 'OFF', conge: 'CP', recup: 'REC', maladie: 'MAL', autre: 'ABS' };

function fmtSlot(s: Shift) { return `${s.heure_debut.slice(0,5)}–${s.heure_fin.slice(0,5)}`; }

function monthCalendar(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // Lundi = 0
  let dow = (first.getDay() + 6) % 7;
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(dow).fill(null);
  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
  return weeks;
}

export default function CalendrierPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [empId, setEmpId] = useState<string>('');
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [shifts, setShifts]     = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading]   = useState(true);
  const [feries, setFeries]     = useState<JourFerie[]>([]);

  useEffect(() => {
    supabase.from('rh_employes').select('id, nom, poste, service').eq('actif', true).order('nom')
      .then((res: { data: Employe[] | null }) => { const emps = res.data ?? []; setEmployes(emps); if (emps.length) setEmpId(emps[0].id); });
    supabase.from('jours_feries').select('*').then(({ data }: { data: JourFerie[] | null }) => setFeries(data ?? []));
  }, []);

  useEffect(() => { if (empId) loadData(); }, [year, month, empId]); // eslint-disable-line

  async function loadData() {
    setLoading(true);
    const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastD = new Date(year, month + 1, 0);
    const last  = `${lastD.getFullYear()}-${String(lastD.getMonth()+1).padStart(2,'0')}-${String(lastD.getDate()).padStart(2,'0')}`;
    const [{ data: sh }, { data: abs }] = await Promise.all([
      supabase.from('planning_shifts').select('*').eq('employe_id', empId).gte('date', first).lte('date', last),
      supabase.from('planning_absences').select('*').eq('employe_id', empId).gte('date', first).lte('date', last),
    ]);
    setShifts((sh ?? []) as Shift[]);
    setAbsences((abs ?? []) as Absence[]);
    setLoading(false);
  }

  const weeks = useMemo(() => monthCalendar(year, month), [year, month]);

  function localDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function shiftOf(d: Date) { const s = localDate(d); return shifts.find(x => x.date === s); }
  function absOf(d: Date)   { const s = localDate(d); return absences.find(x => x.date === s); }

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const today = localDate(new Date());

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/production/personnel" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-black text-gray-900 flex-1">Calendrier mensuel</h1>

        <select value={empId} onChange={e => setEmpId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-amber-400">
          {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>

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
          {/* En-tête jours */}
          <div className="grid grid-cols-7 border-b-2 border-gray-200 bg-gray-50">
            {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(j => (
              <div key={j} className="text-center py-2 text-xs font-black uppercase tracking-wider text-gray-500 border-r border-gray-100 last:border-r-0">{j}</div>
            ))}
          </div>
          {/* Semaines */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="border-r border-gray-100 last:border-r-0 min-h-[80px] bg-gray-50/50" />;
                const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
                const shift = shiftOf(day);
                const absence = absOf(day);
                const isToday = dateStr === today;
                const isWe = di >= 5;
                const ferie = getFerieFromList(dateStr, feries);
                return (
                  <div key={di} className={`border-r border-gray-100 last:border-r-0 min-h-[80px] p-2 ${ferie ? 'bg-green-50' : isWe ? 'bg-gray-50' : ''}`}>
                    <div className={`text-sm font-black mb-1 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-amber-500 text-white' : ferie ? 'bg-green-500 text-white' : 'text-gray-700'}`}>
                      {day.getDate()}
                    </div>
                    {ferie && (
                      <div className="text-[9px] font-bold text-green-700 leading-tight mb-1">{ferie}</div>
                    )}
                    {absence ? (
                      <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded-lg w-full text-center ${ABS_STYLE[absence.type] ?? 'bg-gray-200 text-gray-700'}`}>
                        {ABS_LABEL[absence.type] ?? absence.type}
                      </span>
                    ) : shift ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                        <p className="text-[11px] font-bold text-amber-800">{fmtSlot(shift)}</p>
                        {shift.pause_min > 0 && <p className="text-[9px] text-amber-500">{shift.pause_min}&apos; pause</p>}
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-300 text-center mt-2">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
