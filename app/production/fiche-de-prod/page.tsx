'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Plus, ChefHat, Layers, Play, History, X, Check, Trash2, Edit2, Clock } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecipeSheetLight {
  id: string;
  nom: string;
  rendement: number;
  type: string;
}

interface ProductionSheet {
  id: string;
  sous_recette_id: string | null;
  recipe_sheet_id: string | null;
  rendement_theorique: number;
  poids_piece_cible_g: number | null;
  notes: string | null;
  sous_recette?: RecipeSheetLight | null;
  recipe_sheet?: RecipeSheetLight | null;
}

interface ProductionOrderLine {
  id: string;
  production_order_id: string;
  production_sheet_id: string | null;
  numero_paton: number;
  quantite_theorique: number;
  quantite_reelle: number | null;
  statut: 'en_attente' | 'termine';
  notes: string | null;
  production_sheet?: ProductionSheet | null;
}

interface ProductionOrder {
  id: string;
  date_production: string;
  statut: 'planifie' | 'en_cours' | 'termine';
  notes: string | null;
  created_at: string;
  lines?: ProductionOrderLine[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function statutColor(s: string) {
  if (s === 'termine') return 'bg-green-100 text-green-700';
  if (s === 'en_cours') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-500';
}

function statutLabel(s: string) {
  if (s === 'termine') return 'Terminé';
  if (s === 'en_cours') return 'En cours';
  return 'Planifié';
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function FichesProductionPage() {
  const [sheets, setSheets] = useState<ProductionSheet[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [sousRecettes, setSousRecettes] = useState<RecipeSheetLight[]>([]);
  const [recettes, setRecettes] = useState<RecipeSheetLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'fiches' | 'historique'>('fiches');

  // Modal fiche
  const [sheetModal, setSheetModal] = useState(false);
  const [editingSheet, setEditingSheet] = useState<ProductionSheet | null>(null);
  const [sheetForm, setSheetForm] = useState({
    sous_recette_id: '',
    recipe_sheet_id: '',
    rendement_theorique: 1,
    poids_piece_cible_g: '',
    notes: '',
  });

  // Modal lancement
  const [launchModal, setLaunchModal] = useState<ProductionSheet | null>(null);
  const [launchLines, setLaunchLines] = useState<{ sheet_id: string; nb_patons: number }[]>([]);
  const [launchDate, setLaunchDate] = useState(new Date().toISOString().slice(0, 10));
  const [launching, setLaunching] = useState(false);

  // ── Chargement ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sr }, { data: rec }, { data: sh }, { data: ord }] = await Promise.all([
      supabase.from('recipe_sheets').select('id, nom, rendement, type').eq('type', 'sous_recette').order('nom'),
      supabase.from('recipe_sheets').select('id, nom, rendement, type').eq('type', 'recette').order('nom'),
      supabase.from('production_sheets').select(`
        id, sous_recette_id, recipe_sheet_id, rendement_theorique, poids_piece_cible_g, notes,
        sous_recette:recipe_sheets!sous_recette_id(id, nom, rendement, type),
        recipe_sheet:recipe_sheets!recipe_sheet_id(id, nom, rendement, type)
      `).order('created_at'),
      supabase.from('production_orders_fp').select(`
        id, date_production, statut, notes, created_at,
        lines:production_order_lines(
          id, production_order_id, production_sheet_id, numero_paton,
          quantite_theorique, quantite_reelle, statut, notes,
          production_sheet:production_sheets(
            id, sous_recette_id, recipe_sheet_id, rendement_theorique,
            recipe_sheet:recipe_sheets!recipe_sheet_id(id, nom, rendement, type)
          )
        )
      `).order('date_production', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    setSousRecettes((sr as RecipeSheetLight[]) || []);
    setRecettes((rec as RecipeSheetLight[]) || []);
    setSheets((sh as ProductionSheet[]) || []);
    setOrders((ord as ProductionOrder[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── CRUD fiche ──────────────────────────────────────────────────────────────

  function openNewSheet() {
    setEditingSheet(null);
    setSheetForm({ sous_recette_id: '', recipe_sheet_id: '', rendement_theorique: 1, poids_piece_cible_g: '', notes: '' });
    setSheetModal(true);
  }

  function openEditSheet(s: ProductionSheet) {
    setEditingSheet(s);
    setSheetForm({
      sous_recette_id: s.sous_recette_id || '',
      recipe_sheet_id: s.recipe_sheet_id || '',
      rendement_theorique: s.rendement_theorique,
      poids_piece_cible_g: s.poids_piece_cible_g?.toString() || '',
      notes: s.notes || '',
    });
    setSheetModal(true);
  }

  async function saveSheet() {
    const payload = {
      sous_recette_id: sheetForm.sous_recette_id || null,
      recipe_sheet_id: sheetForm.recipe_sheet_id || null,
      rendement_theorique: sheetForm.rendement_theorique,
      poids_piece_cible_g: sheetForm.poids_piece_cible_g ? parseFloat(sheetForm.poids_piece_cible_g) : null,
      notes: sheetForm.notes || null,
    };
    if (editingSheet) {
      await supabase.from('production_sheets').update(payload).eq('id', editingSheet.id);
    } else {
      await supabase.from('production_sheets').insert(payload);
    }
    setSheetModal(false);
    load();
  }

  async function deleteSheet(id: string) {
    if (!confirm('Supprimer cette fiche de production ?')) return;
    await supabase.from('production_sheets').delete().eq('id', id);
    load();
  }

  // ── Lancement ──────────────────────────────────────────────────────────────

  function openLaunch(sheet: ProductionSheet) {
    setLaunchModal(sheet);
    setLaunchLines([{ sheet_id: sheet.id, nb_patons: 1 }]);
    setLaunchDate(new Date().toISOString().slice(0, 10));
  }

  function addLaunchLine(sheet: ProductionSheet) {
    setLaunchLines(l => [...l, { sheet_id: sheet.id, nb_patons: 1 }]);
  }

  function updateLaunchLine(idx: number, nb: number) {
    setLaunchLines(l => l.map((x, i) => i === idx ? { ...x, nb_patons: nb } : x));
  }

  function removeLaunchLine(idx: number) {
    setLaunchLines(l => l.filter((_, i) => i !== idx));
  }

  async function launchProduction() {
    if (launchLines.length === 0 || !launchModal) return;
    setLaunching(true);
    try {
      // Créer l'ordre
      const { data: order, error: oErr } = await supabase
        .from('production_orders_fp')
        .insert({ date_production: launchDate, statut: 'en_cours' })
        .select('id').single();
      if (oErr || !order) throw oErr;

      // Créer les lignes (pâtons)
      const lines: any[] = [];
      let paton = 1;
      for (const line of launchLines) {
        const sheet = sheets.find(s => s.id === line.sheet_id);
        if (!sheet) continue;
        for (let i = 0; i < line.nb_patons; i++) {
          lines.push({
            production_order_id: order.id,
            production_sheet_id: line.sheet_id,
            numero_paton: paton++,
            quantite_theorique: sheet.rendement_theorique,
            statut: 'en_attente',
          });
        }
      }
      if (lines.length > 0) {
        const { error: lErr } = await supabase.from('production_order_lines').insert(lines);
        if (lErr) throw lErr;
      }

      setLaunchModal(null);
      setTab('historique');
      load();
    } catch (e: any) {
      alert('Erreur : ' + e.message);
    } finally {
      setLaunching(false);
    }
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/production" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fiches de Production</h1>
            <p className="text-sm text-gray-400">{sheets.length} fiche{sheets.length > 1 ? 's' : ''} · {orders.length} lancement{orders.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={openNewSheet}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
          <Plus size={15} /> Nouvelle fiche
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-2">
        <button onClick={() => setTab('fiches')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === 'fiches' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
          <Layers size={15} /> Fiches
        </button>
        <button onClick={() => setTab('historique')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === 'historique' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
          <History size={15} /> Historique
          {orders.filter(o => o.statut === 'en_cours').length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-blue-500 text-white">
              {orders.filter(o => o.statut === 'en_cours').length}
            </span>
          )}
        </button>
      </div>

      {/* ── Onglet Fiches ── */}
      {tab === 'fiches' && (
        <div className="space-y-3">
          {sheets.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <ChefHat className="mx-auto text-gray-200 mb-3" size={40} />
              <p className="text-gray-400 mb-4">Aucune fiche de production</p>
              <button onClick={openNewSheet}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                <Plus size={15} /> Créer une fiche
              </button>
            </div>
          ) : (
            sheets.map(sheet => (
              <div key={sheet.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                {/* En-tête fiche */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-semibold">
                        {sheet.sous_recette?.nom || 'Pâton non lié'}
                      </span>
                      <span className="text-gray-300 text-sm">→</span>
                      <span className="text-sm font-bold text-gray-900">
                        {sheet.recipe_sheet?.nom || 'Produit non lié'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      <span className="font-semibold text-gray-700 text-base">{sheet.rendement_theorique} pcs/pâton</span>
                      {sheet.poids_piece_cible_g && <span>{sheet.poids_piece_cible_g}g/pièce</span>}
                      {sheet.notes && <span className="italic">{sheet.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditSheet(sheet)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteSheet(sheet.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Historique rapide */}
                {orders.some(o => o.lines?.some(l => l.production_sheet_id === sheet.id)) && (
                  <div className="border-t border-gray-50 pt-2">
                    <p className="text-xs text-gray-400 mb-1.5">Dernières productions</p>
                    <div className="space-y-1">
                      {orders
                        .filter(o => o.lines?.some(l => l.production_sheet_id === sheet.id))
                        .slice(0, 3)
                        .map(o => {
                          const myLines = (o.lines || []).filter(l => l.production_sheet_id === sheet.id);
                          const totalTheo = myLines.reduce((s, l) => s + l.quantite_theorique, 0);
                          const totalReel = myLines.filter(l => l.quantite_reelle !== null).reduce((s, l) => s + (l.quantite_reelle || 0), 0);
                          const done = myLines.every(l => l.statut === 'termine');
                          const ecart = done ? totalReel - totalTheo : null;
                          return (
                            <div key={o.id} className="flex items-center justify-between text-xs py-1">
                              <span className="text-gray-500">{fmtDate(o.date_production)}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">{myLines.length} pâton{myLines.length > 1 ? 's' : ''}</span>
                                {done ? (
                                  <span className={`font-bold ${ecart !== null && ecart >= 0 ? 'text-green-600' : 'text-orange-500'}`}>
                                    {totalReel}/{totalTheo}
                                    {ecart !== null && <span className="ml-1">({ecart >= 0 ? '+' : ''}{ecart})</span>}
                                  </span>
                                ) : (
                                  <span className="text-blue-500 font-semibold">En cours</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Bouton lancer */}
                <button onClick={() => openLaunch(sheet)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors border border-blue-100">
                  <Play size={14} /> Lancer en MEP
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Onglet Historique ── */}
      {tab === 'historique' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <History className="mx-auto text-gray-200 mb-3" size={40} />
              <p className="text-gray-400">Aucun lancement de production</p>
            </div>
          ) : (
            orders.map(order => {
              const lines = order.lines || [];
              const totalTheo = lines.reduce((s, l) => s + l.quantite_theorique, 0);
              const termines = lines.filter(l => l.statut === 'termine');
              const totalReel = termines.reduce((s, l) => s + (l.quantite_reelle || 0), 0);
              const allDone = lines.length > 0 && lines.every(l => l.statut === 'termine');
              const ecart = allDone ? totalReel - totalTheo : null;

              // Grouper les lignes par fiche
              const bySheet = lines.reduce((acc, l) => {
                const key = l.production_sheet_id || 'unknown';
                if (!acc[key]) acc[key] = [];
                acc[key].push(l);
                return acc;
              }, {} as Record<string, ProductionOrderLine[]>);

              return (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {/* Header ordre */}
                  <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-50">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{fmtDate(order.date_production)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statutColor(order.statut)}`}>
                          {statutLabel(order.statut)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {lines.length} pâton{lines.length > 1 ? 's' : ''} ·
                        {allDone
                          ? <span className={`ml-1 font-semibold ${ecart !== null && ecart >= 0 ? 'text-green-600' : 'text-orange-500'}`}>
                              {totalReel}/{totalTheo} pcs {ecart !== null && `(${ecart >= 0 ? '+' : ''}${ecart})`}
                            </span>
                          : <span className="ml-1 text-blue-500">{termines.length}/{lines.length} terminés</span>
                        }
                      </p>
                    </div>
                    {allDone && (
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                        <Check size={16} className="text-green-600" />
                      </div>
                    )}
                  </div>

                  {/* Lignes groupées par fiche */}
                  <div className="divide-y divide-gray-50">
                    {Object.entries(bySheet).map(([sheetId, sheetLines]) => {
                      const sheetName = sheetLines[0]?.production_sheet?.recipe_sheet?.nom || 'Produit inconnu';
                      const sheetTheo = sheetLines.reduce((s, l) => s + l.quantite_theorique, 0);
                      const sheetReel = sheetLines.filter(l => l.statut === 'termine').reduce((s, l) => s + (l.quantite_reelle || 0), 0);
                      const sheetDone = sheetLines.every(l => l.statut === 'termine');

                      return (
                        <div key={sheetId} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-800">{sheetName}</p>
                            {sheetDone && (
                              <span className={`text-xs font-bold ${sheetReel >= sheetTheo ? 'text-green-600' : 'text-orange-500'}`}>
                                {sheetReel}/{sheetTheo} pcs
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {sheetLines.map(line => (
                              <div key={line.id} className="flex items-center gap-3">
                                <span className="text-xs text-gray-400 w-16 shrink-0">Pâton {line.numero_paton}</span>
                                <div className="flex-1 bg-gray-50 rounded-lg h-2 overflow-hidden">
                                  {line.statut === 'termine' && line.quantite_reelle !== null && (
                                    <div
                                      className={`h-full rounded-lg ${line.quantite_reelle >= line.quantite_theorique ? 'bg-green-400' : 'bg-orange-400'}`}
                                      style={{ width: `${Math.min(100, (line.quantite_reelle / line.quantite_theorique) * 100)}%` }}
                                    />
                                  )}
                                </div>
                                {line.statut === 'termine' ? (
                                  <span className="text-xs font-semibold text-gray-700 w-20 text-right">
                                    {line.quantite_reelle}/{line.quantite_theorique}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 w-20 text-right flex items-center gap-1 justify-end">
                                    <Clock size={10} /> En attente
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Modal Fiche ── */}
      {sheetModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50">
          <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">{editingSheet ? 'Modifier la fiche' : 'Nouvelle fiche de production'}</p>
              <button onClick={() => setSheetModal(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Pâton source */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sous-recette (pâton source)</label>
                <select value={sheetForm.sous_recette_id}
                  onChange={e => setSheetForm(f => ({ ...f, sous_recette_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="">— Sélectionner —</option>
                  {sousRecettes.map(sr => <option key={sr.id} value={sr.id}>{sr.nom}</option>)}
                </select>
              </div>

              {/* Produit fini */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Recette produit fini</label>
                <select value={sheetForm.recipe_sheet_id}
                  onChange={e => setSheetForm(f => ({ ...f, recipe_sheet_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="">— Sélectionner —</option>
                  {recettes.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
              </div>

              {/* Rendement */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Rendement théorique (pcs/pâton)</label>
                  <input type="number" min={1} value={sheetForm.rendement_theorique}
                    onChange={e => setSheetForm(f => ({ ...f, rendement_theorique: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Poids cible/pièce (g)</label>
                  <input type="number" min={0} step={0.1} value={sheetForm.poids_piece_cible_g}
                    onChange={e => setSheetForm(f => ({ ...f, poids_piece_cible_g: e.target.value }))}
                    placeholder="Optionnel"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
                <input type="text" value={sheetForm.notes}
                  onChange={e => setSheetForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Remarques, conditions particulières..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setSheetModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={saveSheet}
                disabled={!sheetForm.sous_recette_id && !sheetForm.recipe_sheet_id}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40">
                {editingSheet ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Lancement ── */}
      {launchModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50">
          <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-gray-900">Lancer en MEP</p>
                <p className="text-xs text-gray-400 mt-0.5">{launchModal.recipe_sheet?.nom || launchModal.sous_recette?.nom}</p>
              </div>
              <button onClick={() => setLaunchModal(null)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date de production</label>
                <input type="date" value={launchDate}
                  onChange={e => setLaunchDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              {/* Pâtons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600">Pâtons à produire</label>
                </div>
                <div className="space-y-2">
                  {launchLines.map((line, idx) => {
                    const sheet = sheets.find(s => s.id === line.sheet_id);
                    return (
                      <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-700">
                            {sheet?.recipe_sheet?.nom || 'Produit inconnu'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {line.nb_patons} × {sheet?.rendement_theorique} = {line.nb_patons * (sheet?.rendement_theorique || 0)} pcs théo.
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-gray-400">Pâtons</label>
                          <input type="number" min={1} value={line.nb_patons}
                            onChange={e => updateLaunchLine(idx, parseInt(e.target.value) || 1)}
                            className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        {launchLines.length > 1 && (
                          <button onClick={() => removeLaunchLine(idx)}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Ajouter une autre fiche */}
                {sheets.length > 1 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1.5">Ajouter un autre produit dans cette MEP :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sheets.filter(s => s.id !== launchModal.id).map(s => (
                        <button key={s.id} onClick={() => addLaunchLine(s)}
                          className="text-xs px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                          + {s.recipe_sheet?.nom || s.sous_recette?.nom}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Résumé */}
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">Résumé</p>
                {launchLines.map((line, idx) => {
                  const sheet = sheets.find(s => s.id === line.sheet_id);
                  return (
                    <div key={idx} className="flex justify-between text-xs text-blue-600">
                      <span>{sheet?.recipe_sheet?.nom}</span>
                      <span className="font-bold">{line.nb_patons * (sheet?.rendement_theorique || 0)} pcs</span>
                    </div>
                  );
                })}
                <div className="border-t border-blue-200 mt-1.5 pt-1.5 flex justify-between text-xs font-bold text-blue-800">
                  <span>Total pâtons</span>
                  <span>{launchLines.reduce((s, l) => s + l.nb_patons, 0)} pâtons</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setLaunchModal(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={launchProduction} disabled={launching || launchLines.length === 0}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
                <Play size={14} /> {launching ? 'Lancement...' : 'Lancer la MEP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
