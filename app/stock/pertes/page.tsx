'use client';

import { useEffect, useState, useMemo } from 'react';
import { Plus, X, Trash2, AlertTriangle, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockItem {
  id: string; nom: string; unite: string; stock_actuel: number;
  item_type: string; product_reference_id: string | null;
  prix_moyen_pondere: number;
}

interface RecipeSheet {
  id: string; nom: string; unite: string | null; rendement: number; perte_pct: number;
  type: string; product_reference_id: string | null;
  prix_cible: number | null; poids_portion_g: number | null;
  ingredients: {
    quantite: number;
    stock_item_id: string | null;
    sous_recipe_id: string | null;
    stock_item: { prix_moyen_pondere: number; unite: string } | null;
  }[];
}

interface Perte {
  id: string; date: string; quantite: number; note: string | null;
  utilisateur: string | null;
  stock_item: { id: string; nom: string; unite: string; prix_moyen_pondere: number } | null;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MOTIFS = ['Cassé', 'Périmé', 'Brûlé', 'Test R&D', 'Don', 'Autre'];

const MOTIF_COLOR: Record<string, string> = {
  'Cassé':    'bg-gray-100 text-gray-700',
  'Périmé':   'bg-orange-100 text-orange-700',
  'Brûlé':    'bg-red-100 text-red-700',
  'Test R&D': 'bg-blue-100 text-blue-700',
  'Don':      'bg-green-100 text-green-700',
  'Autre':    'bg-purple-100 text-purple-700',
};

const TYPE_LABELS: Record<string, string> = {
  mp:           'Matière première',
  pf:           'Produit fini',
  recette:      'Recette',
  sous_recette: 'Sous-recette',
};

function fmtMAD(v: number) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function MotifBadge({ note }: { note: string | null }) {
  if (!note) return <span className="text-xs text-gray-300">—</span>;
  const motif = MOTIFS.find(m => note.startsWith(m)) ?? note.split(' — ')[0] ?? note;
  const cls = MOTIF_COLOR[motif] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{motif}</span>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PertesPage() {
  const { profile } = useUser();
  const [pertes, setPertes]     = useState<Perte[]>([]);
  const [items, setItems]       = useState<StockItem[]>([]);
  const [recipes, setRecipes]   = useState<RecipeSheet[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterMotif, setFilterMotif] = useState('');

  // Formulaire
  const [fType, setFType]     = useState('mp');
  const [fItemId, setFItemId] = useState('');
  const [fQte, setFQte]       = useState('');
  const [fMotif, setFMotif]   = useState(MOTIFS[0]);
  const [fNote, setFNote]     = useState('');
  const [fDate, setFDate]     = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: p }, { data: it }, { data: rec }] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('id, date, quantite, note, utilisateur, stock_item:stock_items(id, nom, unite, prix_moyen_pondere)')
        .eq('type', 'perte')
        .order('date', { ascending: false })
        .order('id', { ascending: false }),
      supabase.from('stock_items')
        .select('id, nom, unite, stock_actuel, item_type, product_reference_id, prix_moyen_pondere')
        .order('nom'),
      supabase.from('recipe_sheets')
        .select('id, nom, unite, rendement, perte_pct, type, product_reference_id, prix_cible, poids_portion_g, ingredients:recipe_ingredients!recipe_sheet_id(quantite, stock_item_id, sous_recipe_id, stock_item:stock_items(prix_moyen_pondere, unite))')
        .order('nom'),
    ]);
    setPertes((p as Perte[]) || []);
    setItems((it as StockItem[]) || []);
    setRecipes((rec as RecipeSheet[]) || []);
    setLoading(false);
  }

  async function declarer() {
    if (!fItemId || !fQte || parseFloat(fQte) <= 0) return;
    setSaving(true);

    const qte  = parseFloat(fQte);
    const note = fNote.trim() ? `${fMotif} — ${fNote.trim()}` : fMotif;
    const utilisateur = profile ? `${profile.first_name} ${profile.last_name}` : null;

    if (fType === 'mp' || fType === 'pf') {
      const item = items.find(i => i.id === fItemId);
      const valeur = qte * (item?.prix_moyen_pondere ?? 0);
      const noteAvecValeur = `${note} — ${fmtMAD(valeur)}`;

      const [r1, r2] = await Promise.all([
        supabase.from('stock_items').update({
          stock_actuel: Math.max(0, (item?.stock_actuel ?? 0) - qte),
        }).eq('id', fItemId),
        supabase.from('stock_movements').insert({
          stock_item_id: fItemId, type: 'perte', quantite: -qte,
          date: fDate, note: noteAvecValeur, utilisateur,
        }),
      ]);
      if (r1.error || r2.error) {
        alert(`Erreur : ${r1.error?.message ?? r2.error?.message}`);
        setSaving(false);
        return;
      }
    } else {
      // Recette / sous-recette : valorisation en kg, pas de déduction stock
      const recipe = recipes.find(r => r.id === fItemId);
      const nom = recipe?.nom ?? '';
      const coutKg = recipe ? coutKgRecette(recipe) : 0;
      const valeur = qte * coutKg;

      // Besoin d'un stock_item_id valide — lien par product_reference_id ou nom
      const linkedItem =
        (recipe?.product_reference_id
          ? items.find(i => i.product_reference_id === recipe.product_reference_id)
          : null) ??
        items.find(i =>
          i.nom.toLowerCase().includes(nom.toLowerCase()) ||
          nom.toLowerCase().includes(i.nom.toLowerCase())
        );

      if (!linkedItem) {
        alert(`Impossible d'enregistrer : liez la recette "${nom}" à un produit fini.`);
        setSaving(false);
        return;
      }

      const noteAvecValeur = valeur > 0
        ? `${note} — recette: ${nom} ${qte} kg — ${fmtMAD(valeur)}`
        : `${note} — recette: ${nom} ${qte} kg`;

      const { error } = await supabase.from('stock_movements').insert({
        stock_item_id: linkedItem.id,
        type: 'perte',
        quantite: -qte,
        date: fDate,
        note: noteAvecValeur,
        utilisateur,
      });
      if (error) {
        alert(`Erreur : ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setFItemId(''); setFQte(''); setFMotif(MOTIFS[0]); setFNote('');
    setFDate(new Date().toISOString().split('T')[0]);
    setShowForm(false);
    setSaving(false);
    await load();
  }

  async function supprimer(perte: Perte) {
    if (!confirm('Supprimer cette perte ? Le stock ne sera PAS recrédité.')) return;
    await supabase.from('stock_movements').delete().eq('id', perte.id);
    setPertes(prev => prev.filter(p => p.id !== perte.id));
  }

  const displayed = useMemo(() => pertes.filter(p => {
    const matchSearch = !search
      || (p.stock_item?.nom ?? '').toLowerCase().includes(search.toLowerCase())
      || (p.utilisateur ?? '').toLowerCase().includes(search.toLowerCase());
    const matchMotif = !filterMotif || (p.note ?? '').startsWith(filterMotif);
    return matchSearch && matchMotif;
  }), [pertes, search, filterMotif]);

  const GRAM_FACTORS: Record<string, number> = { kg: 1000, g: 1, mg: 0.001, l: 1000, litre: 1000, cl: 10, ml: 1 };

  // Coût de toute la fournée d'une sous-recette (récursif)
  function coutFourneeSR(sr: RecipeSheet): number {
    return (sr.ingredients ?? []).reduce((s, i) => {
      if (i.stock_item_id && i.stock_item) return s + i.quantite * i.stock_item.prix_moyen_pondere;
      if (i.sous_recipe_id) {
        const nested = recipes.find(x => x.id === i.sous_recipe_id);
        if (nested) return s + i.quantite * coutParKgSR(nested);
      }
      return s;
    }, 0);
  }

  // Poids en kg de la fournée d'une sous-recette
  function poidsKgSR(sr: RecipeSheet): number {
    return (sr.ingredients ?? []).reduce((s, i) => {
      if (!i.stock_item) return s;
      const f = GRAM_FACTORS[(i.stock_item.unite ?? '').toLowerCase().trim()] ?? 0;
      return s + (i.quantite * f / 1000);
    }, 0);
  }

  // Coût par kg d'une sous-recette (tient compte de la perte)
  function coutParKgSR(sr: RecipeSheet): number {
    const cout = coutFourneeSR(sr);
    const poids = poidsKgSR(sr);
    const perte = (sr.perte_pct || 0) / 100;
    const kgFini = poids > 0 ? poids * (1 - perte) : (sr.rendement || 1);
    return kgFini > 0 ? cout / kgFini : 0;
  }

  // Poids brut en kg de la fournée d'une recette (MP + SR en kg)
  function poidsKgRecette(r: RecipeSheet): number {
    return (r.ingredients ?? []).reduce((s, i) => {
      if (i.stock_item_id && i.stock_item) {
        const f = GRAM_FACTORS[(i.stock_item.unite ?? '').toLowerCase().trim()] ?? 0;
        return s + i.quantite * f / 1000;
      }
      if (i.sous_recipe_id) return s + i.quantite; // quantité SR = kg output
      return s;
    }, 0);
  }

  // Poids par pièce en kg
  function poidsParPieceKg(r: RecipeSheet): number {
    if (r.poids_portion_g && r.poids_portion_g > 0) return r.poids_portion_g / 1000;
    const brut = poidsKgRecette(r);
    if (brut <= 0) return 0;
    const perte = (r.perte_pct || 0) / 100;
    return brut * (1 - perte) / (r.rendement || 1);
  }

  // Coût par kg d'une recette finale : coût/pièce ÷ poids_pièce_kg
  function coutKgRecette(r: RecipeSheet): number {
    const coutFournee = (r.ingredients ?? []).reduce((s, i) => {
      if (i.stock_item_id && i.stock_item) return s + i.quantite * i.stock_item.prix_moyen_pondere;
      if (i.sous_recipe_id) {
        const sr = recipes.find(x => x.id === i.sous_recipe_id);
        if (sr) return s + i.quantite * coutParKgSR(sr);
      }
      return s;
    }, 0);

    if (coutFournee <= 0) return r.prix_cible ?? 0;

    // Appliquer le facteur perte (comme dans calcLignes côté recettes)
    const perteFactor = 1 / (1 - (r.perte_pct || 0) / 100);
    const coutAvecPerte = coutFournee * perteFactor;
    const coutPiece = coutAvecPerte / (r.rendement || 1);
    const poids = poidsParPieceKg(r);
    if (poids > 0) return coutPiece / poids;

    return r.prix_cible ?? coutPiece;
  }

  // Détecte si la perte est une recette/sous-recette (note contient "recette: …")
  function getRecetteNom(note: string | null): string | null {
    const m = (note ?? '').match(/recette:\s*(.+?)\s+[\d.,]+\s*kg/);
    return m ? m[1] : null;
  }

  // Valeur d'une perte : extraite de la note "… — XX.XX MAD" ou calculée via PMP
  function getValeur(p: Perte): number {
    const match = (p.note ?? '').match(/([\d\s]+[.,]\d{2})\s*MAD/);
    if (match) return parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
    if (p.stock_item?.prix_moyen_pondere) return Math.abs(p.quantite) * p.stock_item.prix_moyen_pondere;
    return 0;
  }

  const totalValeur  = displayed.reduce((s, p) => s + getValeur(p), 0);
  const totalUnites  = displayed.reduce((s, p) => s + Math.abs(p.quantite), 0);


  const articleOptions = useMemo(() => {
    if (fType === 'mp' || fType === 'pf') {
      return items
        .filter(i => i.item_type === fType)
        .map(i => ({ id: i.id, label: `${i.nom} (${i.stock_actuel} ${i.unite})`, pmp: i.prix_moyen_pondere, unite: i.unite }));
    }
    const rsType = fType === 'recette' ? 'recette' : 'sous_recette';
    return recipes
      .filter(r => r.type === rsType)
      .map(r => {
        const ck = coutKgRecette(r);
        return { id: r.id, label: r.nom, pmp: ck, unite: 'kg' };
      });
  }, [fType, items, recipes]);

  const selectedOption = articleOptions.find(o => o.id === fItemId);
  const isRecipeType   = fType === 'recette' || fType === 'sous_recette';
  const estimatedVal   = selectedOption && fQte ? parseFloat(fQte) * selectedOption.pmp : 0;

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pertes & Casse</h1>
          <p className="text-sm text-gray-400">{displayed.length} enregistrement{displayed.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setFItemId(''); setFQte(''); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${showForm ? 'bg-gray-200 text-gray-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Annuler' : 'Déclarer une perte'}
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle size={15} />
            {isRecipeType ? 'Déclaration de perte — valorisation uniquement' : 'Déclaration de perte — stock déduit immédiatement'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">Catégorie *</span>
              <select value={fType} onChange={e => { setFType(e.target.value); setFItemId(''); setFQte(''); }}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">{isRecipeType ? 'Recette *' : 'Article *'}</span>
              <select value={fItemId} onChange={e => setFItemId(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="">— Choisir</option>
                {articleOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">
                Quantité * {selectedOption ? `(${selectedOption.unite})` : isRecipeType ? '(kg)' : ''}
              </span>
              <input type="number" min={0.001} step={0.001} value={fQte}
                onChange={e => setFQte(e.target.value)} placeholder="0"
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">Motif *</span>
              <select value={fMotif} onChange={e => setFMotif(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
                {MOTIFS.map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">Date</span>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-600 font-medium">Note (optionnel)</span>
            <input value={fNote} onChange={e => setFNote(e.target.value)}
              placeholder="Ex : plateau tombé…"
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
          </label>

          {/* Valeur estimée */}
          {estimatedVal > 0 && (
            <div className="flex items-center justify-between bg-white border border-red-200 rounded-xl px-4 py-3">
              <span className="text-sm text-gray-600">
                Valeur de la perte {isRecipeType ? `(${selectedOption?.pmp ?? 0} MAD/kg)` : `(PMP : ${selectedOption?.pmp ?? 0} MAD/${selectedOption?.unite})`}
              </span>
              <span className="text-lg font-black text-red-600">{fmtMAD(estimatedVal)}</span>
            </div>
          )}

          <button onClick={declarer} disabled={saving || !fItemId || !fQte}
            className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors">
            {saving ? 'Enregistrement…' : 'Confirmer la perte'}
          </button>
        </div>
      )}

      {/* Stats motif */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {MOTIFS.slice(0, 4).map(motif => {
          const count = pertes.filter(p => (p.note ?? '').startsWith(motif)).length;
          return (
            <button key={motif} onClick={() => setFilterMotif(filterMotif === motif ? '' : motif)}
              className={`text-left rounded-2xl border px-4 py-3 transition-colors ${filterMotif === motif ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-white'}`}>
              <p className={`text-xl font-black ${filterMotif === motif ? 'text-red-600' : 'text-gray-900'}`}>{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{motif}</p>
            </button>
          );
        })}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Article ou utilisateur…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <button onClick={() => setFilterMotif('')}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${!filterMotif ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Tous
        </button>
        {MOTIFS.map(m => (
          <button key={m} onClick={() => setFilterMotif(filterMotif === m ? '' : m)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${filterMotif === m ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {m}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <AlertTriangle className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucune perte enregistrée</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Article</th>
                    <th className="text-right px-4 py-3">Quantité</th>
                    <th className="text-right px-4 py-3 text-red-500">Valeur</th>
                    <th className="text-left px-4 py-3">Motif</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Utilisateur</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(p => {
                    const val = getValeur(p);
                    const recetteNom = getRecetteNom(p.note);
                    const nomAffiche = recetteNom ?? p.stock_item?.nom ?? '—';
                    const uniteAffiche = recetteNom ? 'kg' : (p.stock_item?.unite ?? '');
                    return (
                      <tr key={p.id} className="border-t border-gray-50 hover:bg-red-50/30 transition-colors">
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.date)}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {nomAffiche}
                          {recetteNom && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full">recette</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums">
                          -{Math.abs(p.quantite)} {uniteAffiche}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                          {val > 0 ? <span className="text-red-600">-{fmtMAD(val)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5"><MotifBadge note={p.note} /></td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs hidden lg:table-cell">{p.utilisateur ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => supprimer(p)} className="p-1 text-gray-300 hover:text-red-500 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr className="text-xs text-gray-500 font-semibold">
                    <td colSpan={2} className="px-4 py-2.5">Total ({displayed.length})</td>
                    <td className="px-4 py-2.5 text-right text-red-600">-{totalUnites.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">-{fmtMAD(totalValeur)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-2">
            {displayed.map(p => {
              const val = getValeur(p);
              const recetteNom = getRecetteNom(p.note);
              const nomAffiche = recetteNom ?? p.stock_item?.nom ?? '—';
              const uniteAffiche = recetteNom ? 'kg' : (p.stock_item?.unite ?? '');
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-red-100 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{nomAffiche}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(p.date)}{p.utilisateur ? ` · ${p.utilisateur}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-red-600 text-sm">-{Math.abs(p.quantite)} {uniteAffiche}</p>
                      {val > 0 && <p className="text-xs text-red-500 font-semibold">-{fmtMAD(val)}</p>}
                    </div>
                    <button onClick={() => supprimer(p)} className="p-1 text-gray-300 hover:text-red-500 rounded-lg ml-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-1.5"><MotifBadge note={p.note} /></div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
