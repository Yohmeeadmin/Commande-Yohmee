'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Check, Clock, ChevronUp, ChevronDown, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Etape {
  id?: string;
  recipe_sheet_id: string;
  ordre: number;
  nom: string;
  duree_fixe_min: number | null;
  mode: 'auto' | 'manuel' | null;
  pieces_par_plaque: number | null;
  plaques_par_niveau: number | null;
  niveaux: number | null;
  notes: string | null;
}

interface EtapeSR {
  nom: string;
  duree_fixe_min: number | null;
  notes: string | null;
}

interface SousRecetteAvecEtapes {
  id: string;
  nom: string;
  etapes: EtapeSR[];
}

interface RecipeLight { id: string; nom: string; }

function fmtDuree(min: number): string {
  if (min <= 0) return '0 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

const EMPTY_ETAPE = (recipeId: string, ordre: number): Etape => ({
  recipe_sheet_id: recipeId,
  ordre,
  nom: '',
  duree_fixe_min: null,
  mode: null,
  pieces_par_plaque: null,
  plaques_par_niveau: null,
  niveaux: null,
  notes: null,
});

export default function EtapesRecettePage() {
  const { id } = useParams<{ id: string }>();
  const [recipe, setRecipe]     = useState<RecipeLight | null>(null);
  const [etapes, setEtapes]     = useState<Etape[]>([]);
  const [sousRecettes, setSousRecettes] = useState<SousRecetteAvecEtapes[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [fourneesOpen, setFourneesOpen] = useState<Set<number>>(new Set());

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);

    const [{ data: rec }, { data: et }, { data: ingredients }] = await Promise.all([
      supabase.from('recipe_sheets').select('id, nom').eq('id', id).single(),
      supabase.from('etapes_recette').select('id, recipe_sheet_id, ordre, nom, duree_fixe_min, mode, pieces_par_plaque, plaques_par_niveau, niveaux, notes').eq('recipe_sheet_id', id).order('ordre'),
      supabase.from('recipe_ingredients').select('sous_recipe_id').eq('recipe_sheet_id', id).not('sous_recipe_id', 'is', null),
    ]);

    setRecipe(rec as RecipeLight);
    setEtapes((et as Etape[]) ?? []);

    // Charger les étapes des sous-recettes liées
    const srIds = (ingredients ?? []).map((i: { sous_recipe_id: string }) => i.sous_recipe_id).filter(Boolean);
    if (srIds.length > 0) {
      const { data: srData } = await supabase
        .from('recipe_sheets')
        .select('id, nom')
        .in('id', srIds);

      const srWithEtapes: SousRecetteAvecEtapes[] = [];
      for (const sr of (srData ?? [])) {
        const { data: srEtapes } = await supabase
          .from('etapes_recette')
          .select('nom, duree_fixe_min, notes')
          .eq('recipe_sheet_id', sr.id)
          .order('ordre');
        if (srEtapes && srEtapes.length > 0) {
          srWithEtapes.push({ id: sr.id, nom: sr.nom, etapes: srEtapes as EtapeSR[] });
        }
      }
      setSousRecettes(srWithEtapes);
    } else {
      setSousRecettes([]);
    }

    setLoading(false);
    setDirty(false);
  }

  function addEtape() {
    const ordre = etapes.length > 0 ? Math.max(...etapes.map(e => e.ordre)) + 1 : 0;
    setEtapes(prev => [...prev, EMPTY_ETAPE(id, ordre)]);
    setDirty(true);
  }

  function update(idx: number, patch: Partial<Etape>) {
    setEtapes(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
    setDirty(true);
  }

  function remove(idx: number) {
    setEtapes(prev => prev.filter((_, i) => i !== idx).map((e, i) => ({ ...e, ordre: i })));
    setDirty(true);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setEtapes(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((e, i) => ({ ...e, ordre: i }));
    });
    setDirty(true);
  }

  function moveDown(idx: number) {
    if (idx === etapes.length - 1) return;
    setEtapes(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((e, i) => ({ ...e, ordre: i }));
    });
    setDirty(true);
  }

  // Importer toutes les étapes d'une sous-recette
  function importerSR(sr: SousRecetteAvecEtapes) {
    const baseOrdre = etapes.length;
    const nouvelles: Etape[] = sr.etapes.map((e, i) => ({
      recipe_sheet_id: id,
      ordre: baseOrdre + i,
      nom: e.nom,
      duree_fixe_min: e.duree_fixe_min,
      notes: e.notes,
      mode: null,
      pieces_par_plaque: null,
      plaques_par_niveau: null,
      niveaux: null,
    }));
    setEtapes(prev => [...prev, ...nouvelles]);
    setDirty(true);
  }

  // Importer une seule étape d'une sous-recette
  function importerEtape(e: EtapeSR) {
    const ordre = etapes.length;
    setEtapes(prev => [...prev, { recipe_sheet_id: id, ordre, nom: e.nom, duree_fixe_min: e.duree_fixe_min, notes: e.notes, mode: null, pieces_par_plaque: null, plaques_par_niveau: null, niveaux: null }]);
    setDirty(true);
  }

  async function save() {
    if (etapes.some(e => !e.nom.trim())) return;
    setSaving(true);
    await supabase.from('etapes_recette').delete().eq('recipe_sheet_id', id);
    if (etapes.length > 0) {
      await supabase.from('etapes_recette').insert(
        etapes.map((e, i) => ({
          recipe_sheet_id: id,
          ordre: i,
          nom: e.nom.trim(),
          duree_fixe_min: e.duree_fixe_min || null,
          mode: e.mode || null,
          pieces_par_plaque: e.pieces_par_plaque || null,
          plaques_par_niveau: e.plaques_par_niveau || null,
          niveaux: e.niveaux || null,
          notes: e.notes?.trim() || null,
          poste_id: null,
          duree_par_piece_sec: null,
          necessite_personnel: false,
        }))
      );
    }
    setSaving(false);
    setDirty(false);
    load();
  }

  const totalMin = etapes.reduce((sum, e) => sum + (e.duree_fixe_min ?? 0), 0);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/recettes`}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Procédé</h1>
            <p className="text-sm text-gray-400">{recipe?.nom}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalMin > 0 && (
            <div className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl">
              <Clock size={14} />
              <span className="font-black">{fmtDuree(totalMin)}</span>
              <span className="text-gray-400 text-xs">total</span>
            </div>
          )}
          {dirty && (
            <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-1.5 rounded-lg">
              Non enregistré
            </span>
          )}
          <button onClick={save} disabled={saving || !dirty}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {saving
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enregistrement…</>
              : <><Check size={15} /> Enregistrer</>}
          </button>
        </div>
      </div>

      {/* Suggestions depuis les sous-recettes */}
      {sousRecettes.length > 0 && (
        <div className="space-y-3">
          {sousRecettes.map(sr => (
            <div key={sr.id} className="bg-indigo-50 border border-indigo-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-100">
                <div>
                  <p className="text-xs font-black text-indigo-400 uppercase tracking-wider">Sous-recette</p>
                  <p className="font-semibold text-indigo-800 text-sm">{sr.nom}</p>
                </div>
                <button onClick={() => importerSR(sr)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors">
                  <Download size={12} /> Tout importer
                </button>
              </div>
              <div className="divide-y divide-indigo-100">
                {sr.etapes.map((e, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-black text-indigo-300 w-4 shrink-0">{i + 1}</span>
                      <span className="text-sm text-indigo-800 font-medium truncate">{e.nom}</span>
                      {e.duree_fixe_min && (
                        <span className="flex items-center gap-1 text-xs text-indigo-500 shrink-0">
                          <Clock size={10} />{e.duree_fixe_min} min
                        </span>
                      )}
                    </div>
                    <button onClick={() => importerEtape(e)}
                      className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors shrink-0 ml-2">
                      <Plus size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Étapes */}
      <div className="space-y-2">
        {etapes.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-14 text-center">
            <p className="text-sm text-gray-400 mb-4">
              {sousRecettes.length > 0
                ? 'Importez les étapes des sous-recettes ci-dessus ou ajoutez vos propres étapes.'
                : 'Aucune étape. Ajoutez les étapes du procédé.'}
            </p>
            <button onClick={addEtape}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
              <Plus size={15} /> Ajouter une étape
            </button>
          </div>
        )}

        {etapes.map((e, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-start gap-3">

            {/* Numéro + flèches */}
            <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
              <button onClick={() => moveUp(idx)} disabled={idx === 0}
                className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors">
                <ChevronUp size={14} />
              </button>
              <span className="text-xs font-black text-gray-400 w-5 text-center">{idx + 1}</span>
              <button onClick={() => moveDown(idx)} disabled={idx === etapes.length - 1}
                className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors">
                <ChevronDown size={14} />
              </button>
            </div>

            {/* Contenu */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={e.nom}
                  onChange={ev => update(idx, { nom: ev.target.value })}
                  placeholder="Nom de l'étape (ex : Pétrissage, Pointage…)"
                  className="flex-1 min-w-[160px] px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <Clock size={13} className="text-gray-400" />
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={e.duree_fixe_min ?? ''}
                    onChange={ev => update(idx, { duree_fixe_min: parseInt(ev.target.value) || null })}
                    placeholder="—"
                    className="w-16 px-2 py-2 border border-gray-200 rounded-xl text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="text-xs text-gray-400">min</span>
                </div>
                {/* Mode auto/manuel */}
                <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0 text-xs font-semibold">
                  <button type="button"
                    onClick={() => update(idx, { mode: e.mode === 'auto' ? null : 'auto' })}
                    className={`px-2.5 py-1.5 transition-colors ${e.mode === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                    Auto
                  </button>
                  <button type="button"
                    onClick={() => update(idx, { mode: e.mode === 'manuel' ? null : 'manuel' })}
                    className={`px-2.5 py-1.5 border-l border-gray-200 transition-colors ${e.mode === 'manuel' ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                    Manuel
                  </button>
                </div>
                {/* Bouton fournée */}
                <button type="button"
                  onClick={() => setFourneesOpen(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; })}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border transition-colors shrink-0 font-semibold ${
                    fourneesOpen.has(idx) || e.pieces_par_plaque
                      ? 'bg-red-50 border-red-200 text-red-500'
                      : 'border-gray-200 text-gray-400 hover:text-gray-600'
                  }`}>
                  🔥 Fournée
                </button>
                <button onClick={() => remove(idx)}
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Config fournée */}
              {(fourneesOpen.has(idx) || e.pieces_par_plaque || e.plaques_par_niveau || e.niveaux) && (() => {
                const total = (e.pieces_par_plaque ?? 0) * (e.plaques_par_niveau ?? 0) * (e.niveaux ?? 0);
                return (
                  <div className="flex items-center gap-2 flex-wrap bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <span className="text-xs text-red-400 font-semibold shrink-0">Capacité :</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} step={1} value={e.pieces_par_plaque ?? ''}
                        onChange={ev => { update(idx, { pieces_par_plaque: parseInt(ev.target.value) || null }); setDirty(true); }}
                        placeholder="—"
                        className="w-14 text-sm text-center font-bold text-red-700 border border-red-200 rounded-xl px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-300" />
                      <span className="text-xs text-red-400">pce/plaque</span>
                    </div>
                    <span className="text-xs text-red-300 font-bold">×</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} step={1} value={e.plaques_par_niveau ?? ''}
                        onChange={ev => { update(idx, { plaques_par_niveau: parseInt(ev.target.value) || null }); setDirty(true); }}
                        placeholder="—"
                        className="w-14 text-sm text-center font-bold text-red-700 border border-red-200 rounded-xl px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-300" />
                      <span className="text-xs text-red-400">plaques/niv</span>
                    </div>
                    <span className="text-xs text-red-300 font-bold">×</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} step={1} value={e.niveaux ?? ''}
                        onChange={ev => { update(idx, { niveaux: parseInt(ev.target.value) || null }); setDirty(true); }}
                        placeholder="—"
                        className="w-14 text-sm text-center font-bold text-red-700 border border-red-200 rounded-xl px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-300" />
                      <span className="text-xs text-red-400">niveaux</span>
                    </div>
                    {total > 0 && (
                      <span className="ml-auto text-sm font-black text-red-600 shrink-0">= {total} pce/fournée</span>
                    )}
                  </div>
                );
              })()}

              {/* Note */}
              {e.notes !== null ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={e.notes}
                    onChange={ev => update(idx, { notes: ev.target.value })}
                    placeholder="Note (température, conseils…)"
                    className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button type="button" onClick={() => update(idx, { notes: null })}
                    className="text-xs text-gray-300 hover:text-gray-500 transition-colors">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => update(idx, { notes: '' })}
                  className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">
                  + ajouter une note
                </button>
              )}
            </div>
          </div>
        ))}

        {etapes.length > 0 && (
          <button onClick={addEtape}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors">
            <Plus size={15} /> Ajouter une étape
          </button>
        )}
      </div>
    </div>
  );
}
