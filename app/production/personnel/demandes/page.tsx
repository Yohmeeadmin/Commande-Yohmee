'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, X, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Employe { id: string; nom: string; service: string | null; }
interface Demande {
  id: string;
  employe_id: string;
  date_debut: string;
  date_fin: string;
  type: string;
  statut: 'en_attente' | 'validee' | 'refusee';
  note: string | null;
  created_at: string;
  employe?: Employe;
}

const TYPE_LABEL: Record<string, string> = { off: 'Jour OFF', conge: 'Congé payé', recup: 'Récupération', maladie: 'Maladie', autre: 'Autre' };
const TYPE_COLOR: Record<string, string> = { off: 'bg-red-100 text-red-700', conge: 'bg-emerald-100 text-emerald-700', recup: 'bg-blue-100 text-blue-700', maladie: 'bg-red-100 text-red-700', autre: 'bg-gray-100 text-gray-600' };
const STATUT_STYLE: Record<string, string> = { en_attente: 'bg-amber-100 text-amber-700', validee: 'bg-emerald-100 text-emerald-700', refusee: 'bg-red-100 text-red-700' };
const STATUT_LABEL: Record<string, string> = { en_attente: 'En attente', validee: 'Validée', refusee: 'Refusée' };

function fmtDate(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function nbJours(debut: string, fin: string) {
  const d = new Date(debut), f = new Date(fin);
  return Math.round((f.getTime() - d.getTime()) / 86400000) + 1;
}

export default function DemandesAbsencePage() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading]  = useState(true);
  const [filterStatut, setFilterStatut] = useState<string>('en_attente');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employe_id: '', date_debut: '', date_fin: '', type: 'conge', note: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: emps }, { data: dem }] = await Promise.all([
      supabase.from('rh_employes').select('id, nom, service').eq('actif', true).order('nom'),
      supabase.from('demandes_absence').select('*').order('created_at', { ascending: false }),
    ]);
    const empList = (emps ?? []) as Employe[];
    const empMap = new Map(empList.map(e => [e.id, e]));
    const enriched: Demande[] = ((dem ?? []) as Demande[]).map(d => ({ ...d, employe: empMap.get(d.employe_id) }));
    setEmployes(empList);
    setDemandes(enriched);
    if (empList.length) setForm(f => ({ ...f, employe_id: empList[0].id }));
    setLoading(false);
  }

  async function setStatut(id: string, statut: 'validee' | 'refusee') {
    await supabase.from('demandes_absence').update({ statut }).eq('id', id);
    // Si validée, créer les absences dans planning_absences
    if (statut === 'validee') {
      const dem = demandes.find(d => d.id === id);
      if (dem) {
        const rows = [];
        const d = new Date(dem.date_debut);
        const fin = new Date(dem.date_fin);
        while (d <= fin) {
          rows.push({ employe_id: dem.employe_id, date: d.toISOString().split('T')[0], type: dem.type });
          d.setDate(d.getDate() + 1);
        }
        await supabase.from('planning_absences').upsert(rows, { onConflict: 'employe_id,date' });
      }
    }
    setDemandes(prev => prev.map(d => d.id === id ? { ...d, statut } : d));
  }

  async function submitDemande() {
    if (!form.employe_id || !form.date_debut || !form.date_fin) return;
    setSubmitting(true);
    const { data } = await supabase.from('demandes_absence').insert({
      employe_id: form.employe_id,
      date_debut: form.date_debut,
      date_fin:   form.date_fin,
      type:       form.type,
      note:       form.note || null,
      statut:     'en_attente',
    }).select('*').single();
    if (data) {
      const emp = employes.find(e => e.id === form.employe_id);
      setDemandes(prev => [{ ...(data as Demande), employe: emp }, ...prev]);
    }
    setShowForm(false);
    setForm(f => ({ ...f, date_debut: '', date_fin: '', note: '' }));
    setSubmitting(false);
  }

  const displayed = demandes.filter(d => !filterStatut || d.statut === filterStatut);
  const nbAttente = demandes.filter(d => d.statut === 'en_attente').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/production/personnel" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-black text-gray-900 flex-1">
          Demandes d&apos;absence
          {nbAttente > 0 && <span className="ml-2 text-xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">{nbAttente}</span>}
        </h1>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors">
          <Plus size={15} /> Nouvelle demande
        </button>
      </div>

      {/* Formulaire nouvelle demande */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <p className="font-bold text-gray-800">Nouvelle demande</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Employé</label>
              <select value={form.employe_id} onChange={e => setForm(f => ({ ...f, employe_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400">
                {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400">
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Du</label>
              <input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Au</label>
              <input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Note (optionnel)</label>
            <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Motif, remarque…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={submitDemande} disabled={submitting}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
              {submitting ? 'Envoi…' : 'Soumettre'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-semibold">Annuler</button>
          </div>
        </div>
      )}

      {/* Filtres statut */}
      <div className="flex items-center gap-2">
        {[{ v: '', label: 'Toutes' }, { v: 'en_attente', label: 'En attente' }, { v: 'validee', label: 'Validées' }, { v: 'refusee', label: 'Refusées' }].map(opt => (
          <button key={opt.v} onClick={() => setFilterStatut(opt.v)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${filterStatut === opt.v ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">Aucune demande</div>
      ) : (
        <div className="space-y-2">
          {displayed.map(d => (
            <div key={d.id} className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-bold text-gray-900">{d.employe?.nom ?? '—'}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${TYPE_COLOR[d.type] ?? 'bg-gray-100 text-gray-600'}`}>{TYPE_LABEL[d.type] ?? d.type}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${STATUT_STYLE[d.statut]}`}>{STATUT_LABEL[d.statut]}</span>
                </div>
                <p className="text-sm text-gray-600">
                  {fmtDate(d.date_debut)} → {fmtDate(d.date_fin)}
                  <span className="ml-2 text-gray-400">({nbJours(d.date_debut, d.date_fin)} jour{nbJours(d.date_debut, d.date_fin) > 1 ? 's' : ''})</span>
                </p>
                {d.note && <p className="text-xs text-gray-400 mt-0.5">{d.note}</p>}
              </div>
              {d.statut === 'en_attente' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setStatut(d.id, 'validee')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-colors">
                    <Check size={12} /> Valider
                  </button>
                  <button onClick={() => setStatut(d.id, 'refusee')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-colors">
                    <X size={12} /> Refuser
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
