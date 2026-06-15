'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type TypeMateriel = 'petrin' | 'four' | 'laminoir' | 'batteur' | 'diviseuse' | 'faconneuse' | 'autre';
type TypeFour = 'ventile' | 'sol' | 'rotatif';
type TypePetrin = 'spirale' | 'bras_plongeant' | 'autre';

interface Sole { plaques: number }

interface ConfigFour {
  type_four: TypeFour;
  // ventilé
  nb_niveaux?: number;
  plaques_par_niveau?: number;
  // sol
  soles?: Sole[];
  // rotatif
  nb_plaques?: number;
}

interface ConfigPetrin {
  capacite_pate_kg: number;
  type_petrin?: TypePetrin;
}

interface ConfigLaminoir { largeur_cm: number }
interface ConfigBatteur  { capacite_l: number }
interface ConfigDiviseuse { nb_pates: number }
interface ConfigFaconneuse { pieces_heure?: number }

type Config = ConfigFour | ConfigPetrin | ConfigLaminoir | ConfigBatteur | ConfigDiviseuse | ConfigFaconneuse | Record<string, never>;

interface Materiel {
  id: string;
  nom: string;
  type: TypeMateriel;
  config: Config | null;
  capacite_kg: number; // legacy, kept for compat
  ateliers: string[];
  notes: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TypeMateriel, string> = {
  petrin: 'Pétrin',
  four: 'Four',
  laminoir: 'Laminoir',
  batteur: 'Batteur',
  diviseuse: 'Diviseuse',
  faconneuse: 'Façonneuse',
  autre: 'Autre',
};

const TYPE_ICONS: Record<TypeMateriel, string> = {
  petrin: '🔄',
  four: '🔥',
  laminoir: '📏',
  batteur: '🥣',
  diviseuse: '✂️',
  faconneuse: '🥖',
  autre: '⚙️',
};

const TYPE_FOUR_LABELS: Record<TypeFour, string> = {
  ventile: 'Ventilé / Convection',
  sol: 'À sole (sol)',
  rotatif: 'Rotatif',
};

const TYPE_PETRIN_LABELS: Record<TypePetrin, string> = {
  spirale: 'Spirale',
  bras_plongeant: 'Bras plongeant',
  autre: 'Autre',
};

const ATELIER_COLORS: Record<string, string> = {
  Boulangerie: 'bg-amber-100 text-amber-700',
  Viennoiserie: 'bg-orange-100 text-orange-700',
  Pâtisserie: 'bg-pink-100 text-pink-700',
  Burger: 'bg-red-100 text-red-700',
  Traiteur: 'bg-blue-100 text-blue-700',
};
function atelierColor(a: string) { return ATELIER_COLORS[a] ?? 'bg-gray-100 text-gray-600'; }

/** Calcule le nb de plaques total d'un four */
function fourPlaques(config: ConfigFour): number {
  if (config.type_four === 'ventile') return (config.nb_niveaux ?? 0) * (config.plaques_par_niveau ?? 0);
  if (config.type_four === 'sol') return (config.soles ?? []).reduce((s, sole) => s + sole.plaques, 0);
  if (config.type_four === 'rotatif') return config.nb_plaques ?? 0;
  return 0;
}

/** Résumé des specs d'un matériel */
function specResume(m: Materiel): string {
  if (!m.config) return '';
  const c = m.config as unknown;
  if (m.type === 'petrin') return `${(c as ConfigPetrin).capacite_pate_kg ?? '?'} kg pâte`;
  if (m.type === 'four') {
    const fc = m.config as ConfigFour;
    const p = fourPlaques(fc);
    if (fc.type_four === 'ventile') return `${TYPE_FOUR_LABELS.ventile} · ${fc.nb_niveaux ?? 0} niv × ${fc.plaques_par_niveau ?? 0} plaques (${p} total)`;
    if (fc.type_four === 'sol') return `Sole · ${(fc.soles ?? []).length} sole${(fc.soles ?? []).length > 1 ? 's' : ''} · ${p} plaque${p > 1 ? 's' : ''} total`;
    if (fc.type_four === 'rotatif') return `Rotatif · ${fc.nb_plaques ?? 0} plaques`;
  }
  if (m.type === 'laminoir') return `Largeur ${(c as ConfigLaminoir).largeur_cm ?? '?'} cm`;
  if (m.type === 'batteur') return `${(c as ConfigBatteur).capacite_l ?? '?'} L`;
  if (m.type === 'diviseuse') return `${(c as ConfigDiviseuse).nb_pates ?? '?'} pâtons`;
  if (m.type === 'faconneuse') { const ph = (c as ConfigFaconneuse).pieces_heure; return ph ? `${ph} pce/h` : ''; }
  return '';
}

// ─── Form state ──────────────────────────────────────────────────────────────

interface FormState {
  nom: string;
  type: TypeMateriel;
  ateliers: string[];
  notes: string;
  // pétrin
  capacite_pate_kg: string;
  type_petrin: TypePetrin;
  // four
  type_four: TypeFour;
  nb_niveaux: string;
  plaques_par_niveau: string;
  soles: Sole[];
  nb_plaques: string;
  // laminoir
  largeur_cm: string;
  // batteur
  capacite_l: string;
  // diviseuse
  nb_pates: string;
  // faconneuse
  pieces_heure: string;
}

const EMPTY_FORM: FormState = {
  nom: '', type: 'autre', ateliers: [], notes: '',
  capacite_pate_kg: '', type_petrin: 'spirale',
  type_four: 'ventile', nb_niveaux: '', plaques_par_niveau: '', soles: [{ plaques: 2 }], nb_plaques: '',
  largeur_cm: '', capacite_l: '', nb_pates: '', pieces_heure: '',
};

function formFromMateriel(m: Materiel): FormState {
  const f = { ...EMPTY_FORM, nom: m.nom, type: m.type || 'autre', ateliers: m.ateliers ?? [], notes: m.notes ?? '' };
  if (!m.config) return f;
  const c = m.config as unknown;
  if (m.type === 'petrin') {
    f.capacite_pate_kg = String((c as ConfigPetrin).capacite_pate_kg ?? '');
    f.type_petrin = ((c as ConfigPetrin).type_petrin ?? 'spirale') as TypePetrin;
  }
  if (m.type === 'four') {
    const fc = m.config as ConfigFour;
    f.type_four = fc.type_four ?? 'ventile';
    f.nb_niveaux = String(fc.nb_niveaux ?? '');
    f.plaques_par_niveau = String(fc.plaques_par_niveau ?? '');
    f.soles = fc.soles ?? [{ plaques: 2 }];
    f.nb_plaques = String(fc.nb_plaques ?? '');
  }
  if (m.type === 'laminoir') f.largeur_cm = String((c as ConfigLaminoir).largeur_cm ?? '');
  if (m.type === 'batteur') f.capacite_l = String((c as ConfigBatteur).capacite_l ?? '');
  if (m.type === 'diviseuse') f.nb_pates = String((c as ConfigDiviseuse).nb_pates ?? '');
  if (m.type === 'faconneuse') f.pieces_heure = String((c as ConfigFaconneuse).pieces_heure ?? '');
  return f;
}

function buildConfig(f: FormState): Config {
  if (f.type === 'petrin') return { capacite_pate_kg: parseFloat(f.capacite_pate_kg) || 0, type_petrin: f.type_petrin };
  if (f.type === 'four') {
    if (f.type_four === 'ventile') return { type_four: 'ventile', nb_niveaux: parseInt(f.nb_niveaux) || 0, plaques_par_niveau: parseInt(f.plaques_par_niveau) || 0 };
    if (f.type_four === 'sol') return { type_four: 'sol', soles: f.soles };
    if (f.type_four === 'rotatif') return { type_four: 'rotatif', nb_plaques: parseInt(f.nb_plaques) || 0 };
  }
  if (f.type === 'laminoir') return { largeur_cm: parseFloat(f.largeur_cm) || 0 };
  if (f.type === 'batteur') return { capacite_l: parseFloat(f.capacite_l) || 0 };
  if (f.type === 'diviseuse') return { nb_pates: parseInt(f.nb_pates) || 0 };
  if (f.type === 'faconneuse') return { pieces_heure: parseInt(f.pieces_heure) || undefined };
  return {};
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function MaterielPage() {
  const [items, setItems] = useState<Materiel[]>([]);
  const [allAteliers, setAllAteliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Materiel | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: mat }, { data: refs }] = await Promise.all([
      supabase.from('materiel').select('*').order('nom'),
      supabase.from('recipe_sheets').select('atelier').not('atelier', 'is', null),
    ]);
    setItems((mat as Materiel[]) ?? []);
    const unique = [...new Set((refs ?? []).map((r: { atelier: string }) => r.atelier).filter(Boolean))].sort() as string[];
    setAllAteliers(unique);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setModal(true); }
  function openEdit(m: Materiel) { setEditing(m); setForm(formFromMateriel(m)); setModal(true); }
  function toggleAtelier(a: string) {
    setForm(f => ({ ...f, ateliers: f.ateliers.includes(a) ? f.ateliers.filter(x => x !== a) : [...f.ateliers, a] }));
  }

  async function save() {
    if (!form.nom.trim()) return;
    setSaving(true);
    const config = buildConfig(form);
    // legacy capacite_kg
    const capacite_kg = form.type === 'petrin' ? (parseFloat(form.capacite_pate_kg) || 0) : 0;
    const payload = { nom: form.nom.trim(), type: form.type, config, capacite_kg, ateliers: form.ateliers, notes: form.notes.trim() || null };
    if (editing) await supabase.from('materiel').update(payload).eq('id', editing.id);
    else await supabase.from('materiel').insert(payload);
    setSaving(false);
    setModal(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce matériel ?')) return;
    await supabase.from('materiel').delete().eq('id', id);
    load();
  }

  // Grouper par type
  const grouped = useMemo(() => {
    const g: Partial<Record<TypeMateriel, Materiel[]>> = {};
    for (const m of items) {
      const t = m.type || 'autre';
      if (!g[t]) g[t] = [];
      g[t]!.push(m);
    }
    return g;
  }, [items]);

  const typeOrder: TypeMateriel[] = ['four', 'petrin', 'batteur', 'diviseuse', 'faconneuse', 'laminoir', 'autre'];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/production" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Matériel</h1>
            <p className="text-sm text-gray-400">Équipements et capacités de production</p>
          </div>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">
          <Plus size={16} /> Ajouter un équipement
        </button>
      </div>

      {/* Liste groupée par type */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-20 text-center">
          <p className="text-4xl mb-4">⚙️</p>
          <h3 className="font-bold text-gray-900 mb-1">Aucun équipement</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
            Configurez vos équipements une fois — le planning calculera automatiquement le nombre de fournées.
          </p>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
            <Plus size={15} /> Ajouter un équipement
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {typeOrder.filter(t => grouped[t]?.length).map(type => (
            <div key={type}>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                {TYPE_ICONS[type]} {TYPE_LABELS[type]}s
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped[type]!.map(m => {
                  const resume = specResume(m);
                  const plaques = m.type === 'four' ? fourPlaques(m.config as ConfigFour) : 0;
                  return (
                    <div key={m.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-sm transition-all">
                      <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{TYPE_ICONS[m.type || 'autre']}</span>
                            <div>
                              <p className="font-black text-gray-900 leading-tight">{m.nom}</p>
                              {m.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{m.notes}</p>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit(m)}
                              className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => remove(m.id)}
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Specs */}
                        {resume && (
                          <div className="bg-gray-50 rounded-xl px-3 py-2 mb-2.5 text-xs text-gray-600 font-medium">
                            {resume}
                          </div>
                        )}

                        {/* Four : détail niveaux/soles */}
                        {m.type === 'four' && plaques > 0 && (() => {
                          const fc = m.config as ConfigFour;
                          return (
                            <div className="flex items-center gap-1.5 text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3 py-1.5 mb-2.5">
                              🔥 {plaques} plaque{plaques > 1 ? 's' : ''} au total
                              {fc.type_four === 'ventile' && <span className="text-red-300 font-normal">· {fc.nb_niveaux} niv × {fc.plaques_par_niveau} plaques</span>}
                              {fc.type_four === 'sol' && <span className="text-red-300 font-normal">· {(fc.soles ?? []).length} sole{(fc.soles ?? []).length > 1 ? 's' : ''}</span>}
                            </div>
                          );
                        })()}

                        {/* Ateliers */}
                        {m.ateliers && m.ateliers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.ateliers.map(a => (
                              <span key={a} className={`text-xs font-bold px-2 py-0.5 rounded-md ${atelierColor(a)}`}>{a}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-300 italic">Tous ateliers</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full sm:max-w-xl rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">

            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
              <p className="font-black text-gray-900 text-lg">{editing ? 'Modifier l\'équipement' : 'Nouvel équipement'}</p>
              <button onClick={() => setModal(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">

              {/* Nom */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Nom</label>
                <input type="text" value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="ex : Pétrin Bongar 60L, Four Bongard 4 niveaux…"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.entries(TYPE_LABELS) as [TypeMateriel, string][]).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setForm(f => ({ ...f, type: val }))}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                        form.type === val ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      <span className="text-lg">{TYPE_ICONS[val]}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Config pétrin ── */}
              {form.type === 'petrin' && (
                <div className="space-y-3 bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Configuration pétrin</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Capacité pâte (kg)</label>
                      <input type="number" min={1} value={form.capacite_pate_kg}
                        onChange={e => setForm(f => ({ ...f, capacite_pate_kg: e.target.value }))}
                        placeholder="ex : 60"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Type</label>
                      <select value={form.type_petrin} onChange={e => setForm(f => ({ ...f, type_petrin: e.target.value as TypePetrin }))}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                        {(Object.entries(TYPE_PETRIN_LABELS) as [TypePetrin, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Config four ── */}
              {form.type === 'four' && (
                <div className="space-y-3 bg-red-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-red-400 uppercase tracking-wider">🔥 Configuration four</p>

                  {/* Type de four */}
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(TYPE_FOUR_LABELS) as [TypeFour, string][]).map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setForm(f => ({ ...f, type_four: val }))}
                        className={`py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                          form.type_four === val ? 'border-red-500 bg-red-500 text-white' : 'border-red-200 text-red-400 hover:border-red-300 bg-white'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Ventilé */}
                  {form.type_four === 'ventile' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-red-400 mb-1 block">Nombre de niveaux</label>
                        <input type="number" min={1} value={form.nb_niveaux}
                          onChange={e => setForm(f => ({ ...f, nb_niveaux: e.target.value }))}
                          placeholder="ex : 4"
                          className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-300 bg-white" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-red-400 mb-1 block">Plaques par niveau</label>
                        <input type="number" min={1} value={form.plaques_par_niveau}
                          onChange={e => setForm(f => ({ ...f, plaques_par_niveau: e.target.value }))}
                          placeholder="ex : 6"
                          className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-300 bg-white" />
                      </div>
                      {form.nb_niveaux && form.plaques_par_niveau && (
                        <div className="col-span-2 text-center text-sm font-black text-red-600 bg-white rounded-xl py-2 border border-red-200">
                          = {parseInt(form.nb_niveaux) * parseInt(form.plaques_par_niveau)} plaques au total
                        </div>
                      )}
                    </div>
                  )}

                  {/* À sole */}
                  {form.type_four === 'sol' && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-red-400">Soles (étages)</p>
                      {form.soles.map((sole, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white border border-red-200 rounded-xl px-3 py-2">
                          <span className="text-xs font-black text-red-300 w-16 shrink-0">Sole {i + 1}</span>
                          <input type="number" min={1} value={sole.plaques}
                            onChange={e => setForm(f => {
                              const soles = [...f.soles];
                              soles[i] = { plaques: parseInt(e.target.value) || 1 };
                              return { ...f, soles };
                            })}
                            className="w-16 text-center text-sm font-bold border border-red-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-300" />
                          <span className="text-xs text-red-400">plaque{sole.plaques > 1 ? 's' : ''}</span>
                          <button type="button" onClick={() => setForm(f => ({ ...f, soles: f.soles.filter((_, j) => j !== i) }))}
                            className="ml-auto p-1 text-red-300 hover:text-red-500 transition-colors">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, soles: [...f.soles, { plaques: 2 }] }))}
                        className="w-full py-2 border-2 border-dashed border-red-200 text-xs font-semibold text-red-400 rounded-xl hover:border-red-300 hover:text-red-500 transition-colors">
                        + Ajouter une sole
                      </button>
                      {form.soles.length > 0 && (
                        <p className="text-center text-sm font-black text-red-600">
                          = {form.soles.reduce((s, sol) => s + sol.plaques, 0)} plaques au total
                        </p>
                      )}
                    </div>
                  )}

                  {/* Rotatif */}
                  {form.type_four === 'rotatif' && (
                    <div>
                      <label className="text-xs font-semibold text-red-400 mb-1 block">Nombre de plaques total</label>
                      <input type="number" min={1} value={form.nb_plaques}
                        onChange={e => setForm(f => ({ ...f, nb_plaques: e.target.value }))}
                        placeholder="ex : 18"
                        className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-300 bg-white" />
                    </div>
                  )}
                </div>
              )}

              {/* ── Config laminoir ── */}
              {form.type === 'laminoir' && (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 block">Largeur (cm)</label>
                  <input type="number" min={10} value={form.largeur_cm}
                    onChange={e => setForm(f => ({ ...f, largeur_cm: e.target.value }))}
                    placeholder="ex : 60"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                </div>
              )}

              {/* ── Config batteur ── */}
              {form.type === 'batteur' && (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 block">Capacité (litres)</label>
                  <input type="number" min={1} value={form.capacite_l}
                    onChange={e => setForm(f => ({ ...f, capacite_l: e.target.value }))}
                    placeholder="ex : 20"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                </div>
              )}

              {/* ── Config diviseuse ── */}
              {form.type === 'diviseuse' && (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 block">Pâtons par coupe</label>
                  <input type="number" min={1} value={form.nb_pates}
                    onChange={e => setForm(f => ({ ...f, nb_pates: e.target.value }))}
                    placeholder="ex : 8"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                </div>
              )}

              {/* ── Config façonneuse ── */}
              {form.type === 'faconneuse' && (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 block">Pièces / heure (optionnel)</label>
                  <input type="number" min={1} value={form.pieces_heure}
                    onChange={e => setForm(f => ({ ...f, pieces_heure: e.target.value }))}
                    placeholder="ex : 1800"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                </div>
              )}

              {/* Ateliers */}
              {allAteliers.length > 0 && (
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Ateliers (optionnel)</label>
                  <div className="flex flex-wrap gap-2">
                    {allAteliers.map(a => {
                      const sel = form.ateliers.includes(a);
                      return (
                        <button key={a} type="button" onClick={() => toggleAtelier(a)}
                          className={`px-3 py-1.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                            sel ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}>
                          {a}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Notes (optionnel)</label>
                <input type="text" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Marque, modèle, particularités…"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setModal(false)}
                className="flex-1 px-4 py-3 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button onClick={save} disabled={saving || !form.nom.trim()}
                className="flex-1 px-4 py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {saving
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enregistrement…</>
                  : <><Check size={15} /> {editing ? 'Enregistrer' : 'Créer'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
