'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employe { id: string; nom: string; poste: string | null; service: string | null; heures_contrat: number | null; }
interface Shift { employe_id: string; date: string; heure_debut: string; heure_fin: string; pause_min: number; }
interface Absence { employe_id: string; date: string; type: string; }
interface Demande {
  id: string;
  employe_id: string;
  date_debut: string;
  date_fin: string;
  type: string;
  statut: 'en_attente' | 'validee' | 'refusee';
  note: string | null;
  created_at: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const TYPE_LABEL: Record<string, string> = { off: 'Jour OFF', conge: 'Congé payé', recup: 'Récupération', maladie: 'Maladie', autre: 'Autre' };
const TYPE_COLOR: Record<string, string> = {
  off:     'bg-red-100 text-red-700 border-red-200',
  conge:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  recup:   'bg-blue-100 text-blue-700 border-blue-200',
  maladie: 'bg-red-100 text-red-700 border-red-200',
  autre:   'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUT_STYLE: Record<string, string> = {
  en_attente: 'bg-amber-100 text-amber-700',
  validee:    'bg-emerald-100 text-emerald-700',
  refusee:    'bg-red-100 text-red-700',
};
const STATUT_LABEL: Record<string, string> = { en_attente: 'En attente', validee: 'Validée', refusee: 'Refusée' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const day = d.getDay(), diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0); return m;
}
function weekDatesOf(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().split('T')[0];
  });
}
function getISOWeek(d: Date): number {
  const t = new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7);
  const w = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - w.getTime()) / 86400000 - 3 + (w.getDay() + 6) % 7) / 7);
}
function fmtDate(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
function fmtDateLong(d: string) { return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
function nbJours(debut: string, fin: string) {
  return Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86400000) + 1;
}
function slotMin(s: Shift): number {
  const [dh, dm] = s.heure_debut.split(':').map(Number), [fh, fm] = s.heure_fin.split(':').map(Number);
  let diff = (fh * 60 + fm) - (dh * 60 + dm);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - (s.pause_min ?? 0));
}
function fmtMin(m: number): string {
  const h = Math.floor(m / 60), mn = m % 60;
  return mn === 0 ? `${h}h` : `${h}h${String(mn).padStart(2,'0')}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MonPlanningPage() {
  const { profile, signOut } = useUser();
  const [employe, setEmploye]   = useState<Employe | null>(null);
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOf(new Date()));
  const [shifts, setShifts]     = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ date_debut: '', date_fin: '', type: 'conge', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab]           = useState<'planning' | 'demandes'>('planning');

  useEffect(() => {
    if (!profile?.employe_id) return;
    supabase.from('rh_employes').select('id, nom, poste, service, heures_contrat').eq('id', profile.employe_id).single()
      .then((res: { data: Employe | null }) => setEmploye(res.data));
    loadDemandes();
  }, [profile?.employe_id]); // eslint-disable-line

  useEffect(() => {
    if (!profile?.employe_id) return;
    loadWeek();
  }, [weekMonday, profile?.employe_id]); // eslint-disable-line

  async function loadWeek() {
    setLoading(true);
    const dates = weekDatesOf(weekMonday);
    const [{ data: sh }, { data: abs }] = await Promise.all([
      supabase.from('planning_shifts').select('*').eq('employe_id', profile!.employe_id).in('date', dates),
      supabase.from('planning_absences').select('*').eq('employe_id', profile!.employe_id).in('date', dates),
    ]);
    setShifts((sh ?? []) as Shift[]);
    setAbsences((abs ?? []) as Absence[]);
    setLoading(false);
  }

  async function loadDemandes() {
    const { data } = await supabase
      .from('demandes_absence')
      .select('*')
      .eq('employe_id', profile!.employe_id)
      .order('created_at', { ascending: false });
    setDemandes((data ?? []) as Demande[]);
  }

  async function submitDemande() {
    if (!form.date_debut || !form.date_fin || !profile?.employe_id) return;
    setSubmitting(true);
    const { data } = await supabase.from('demandes_absence').insert({
      employe_id: profile.employe_id,
      date_debut: form.date_debut,
      date_fin:   form.date_fin,
      type:       form.type,
      note:       form.note || null,
      statut:     'en_attente',
    }).select('*').single();
    if (data) setDemandes(prev => [data as Demande, ...prev]);
    setShowForm(false);
    setForm({ date_debut: '', date_fin: '', type: 'conge', note: '' });
    setSubmitting(false);
  }

  const dates = useMemo(() => weekDatesOf(weekMonday), [weekMonday]);
  const totalMin = shifts.reduce((sum, s) => sum + slotMin(s), 0);
  const today = new Date().toISOString().split('T')[0];

  if (!profile?.employe_id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <p className="text-gray-500">Votre compte n&apos;est pas lié à un employé.</p>
          <p className="text-sm text-gray-400">Contactez votre responsable.</p>
          <button onClick={signOut} className="text-sm text-red-500 hover:underline">Se déconnecter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">
              {employe?.nom ?? `${profile.first_name} ${profile.last_name}`}
            </h1>
            <p className="text-xs text-gray-400">{employe?.poste ?? ''}{employe?.service ? ` · ${employe.service}` : ''}</p>
          </div>
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            Déconnexion
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Tabs */}
        <div className="flex bg-white border border-gray-200 rounded-2xl p-1 gap-1">
          <button onClick={() => setTab('planning')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'planning' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            Mon planning
          </button>
          <button onClick={() => setTab('demandes')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'demandes' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            Mes demandes
            {demandes.filter(d => d.statut === 'en_attente').length > 0 && (
              <span className="ml-1.5 bg-amber-200 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {demandes.filter(d => d.statut === 'en_attente').length}
              </span>
            )}
          </button>
        </div>

        {tab === 'planning' && (
          <>
            {/* Sélecteur semaine */}
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <button onClick={() => setWeekMonday(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <p className="text-sm font-black text-gray-900">Semaine {getISOWeek(weekMonday)}</p>
                <p className="text-xs text-gray-400">{MOIS[weekMonday.getMonth()]} {weekMonday.getFullYear()}</p>
              </div>
              <button onClick={() => setWeekMonday(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Total semaine */}
            {totalMin > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-amber-700 font-semibold">Total semaine</span>
                <span className="text-lg font-black text-amber-800">{fmtMin(totalMin)}</span>
              </div>
            )}

            {/* Jours */}
            {loading ? (
              <div className="text-center py-8 text-gray-400">Chargement…</div>
            ) : (
              <div className="space-y-2">
                {dates.map((date, i) => {
                  const shift = shifts.find(s => s.date === date);
                  const absence = absences.find(a => a.date === date);
                  const isToday = date === today;
                  const isPast = date < today;

                  return (
                    <div key={date} className={`bg-white rounded-2xl border-2 px-4 py-3 transition-all ${isToday ? 'border-amber-400 shadow-sm' : 'border-gray-100'} ${isPast ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-bold ${isToday ? 'text-amber-600' : 'text-gray-700'}`}>
                            {JOURS[i]} {fmtDate(date)}
                            {isToday && <span className="ml-2 text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">Aujourd&apos;hui</span>}
                          </p>
                        </div>
                        {absence ? (
                          <span className={`text-xs font-bold px-3 py-1 rounded-xl border ${TYPE_COLOR[absence.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {TYPE_LABEL[absence.type] ?? absence.type}
                          </span>
                        ) : shift ? (
                          <div className="text-right">
                            <p className="text-sm font-black text-gray-900">{shift.heure_debut.slice(0,5)} → {shift.heure_fin.slice(0,5)}</p>
                            <p className="text-xs text-gray-400">{fmtMin(slotMin(shift))}{shift.pause_min > 0 ? ` · ${shift.pause_min}' pause` : ''}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'demandes' && (
          <>
            {/* Bouton nouvelle demande */}
            <button onClick={() => setShowForm(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-sm font-bold transition-colors">
              <Plus size={16} /> Nouvelle demande d&apos;absence
            </button>

            {/* Formulaire */}
            {showForm && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <p className="font-bold text-gray-800">Nouvelle demande</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400">
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Du</label>
                    <input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Au</label>
                    <input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
                  </div>
                </div>
                {form.date_debut && form.date_fin && new Date(form.date_fin) >= new Date(form.date_debut) && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                    {nbJours(form.date_debut, form.date_fin)} jour{nbJours(form.date_debut, form.date_fin) > 1 ? 's' : ''} — {fmtDateLong(form.date_debut)} → {fmtDateLong(form.date_fin)}
                  </p>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Note (optionnel)</label>
                  <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Motif, remarque…"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
                </div>
                <div className="flex gap-2">
                  <button onClick={submitDemande} disabled={submitting || !form.date_debut || !form.date_fin}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                    {submitting ? 'Envoi…' : 'Envoyer la demande'}
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="px-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Liste demandes */}
            {demandes.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                Aucune demande pour l&apos;instant
              </div>
            ) : (
              <div className="space-y-2">
                {demandes.map(d => (
                  <div key={d.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${TYPE_COLOR[d.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'} border`}>
                            {TYPE_LABEL[d.type] ?? d.type}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${STATUT_STYLE[d.statut]}`}>
                            {d.statut === 'validee' && <Check size={10} className="inline mr-0.5" />}
                            {STATUT_LABEL[d.statut]}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800">
                          {fmtDate(d.date_debut)} → {fmtDate(d.date_fin)}
                          <span className="ml-2 text-xs text-gray-400">({nbJours(d.date_debut, d.date_fin)}j)</span>
                        </p>
                        {d.note && <p className="text-xs text-gray-400 mt-0.5">{d.note}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
