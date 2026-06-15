'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Package, TrendingDown, AlertTriangle, Warehouse,
  ArrowDownLeft, ArrowUpRight, Flame, ClipboardList,
  RefreshCw, BarChart2, ShoppingBag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
  id: string;
  nom: string;
  unite: string;
  item_type: 'mp' | 'pf';
  stock_actuel: number;
  stock_min: number;
  prix_moyen_pondere: number;
  quantite_reservee: number;
  categorie: string | null;
  atelier: string | null;
}

interface Movement {
  id: string;
  stock_item_id: string;
  type: string;
  quantite: number;
  date: string;
  note: string | null;
  stock_item?: { nom: string; unite: string; item_type: string } | null;
}

interface RecipeSheet {
  id: string;
  nom: string;
  type: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MOTIFS = ['Cassé', 'Périmé', 'Brûlé', 'Test R&D', 'Don', 'Autre'];

const CAT_PERTES: Record<string, { label: string; color: string; bar: string; dot: string }> = {
  mp:           { label: 'Matière première', color: 'text-blue-600',   bar: 'bg-blue-500',   dot: 'bg-blue-500' },
  pf:           { label: 'Produit fini',     color: 'text-purple-600', bar: 'bg-purple-500', dot: 'bg-purple-500' },
  recette:      { label: 'Recette',          color: 'text-orange-600', bar: 'bg-orange-500', dot: 'bg-orange-500' },
  sous_recette: { label: 'Sous-recette',     color: 'text-yellow-600', bar: 'bg-yellow-500', dot: 'bg-yellow-400' },
};

function fmtMAD(v: number) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function getRecetteNom(note: string | null): string | null {
  const m = (note ?? '').match(/recette:\s*(.+?)\s+[\d.,]+\s*kg/);
  return m ? m[1] : null;
}

function getValeurPerte(m: Movement): number {
  const match = (m.note ?? '').match(/([\d\s]+[.,]\d{2})\s*MAD/);
  if (match) return parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
  if (m.stock_item && (m.stock_item as { prix_moyen_pondere?: number }).prix_moyen_pondere)
    return Math.abs(m.quantite) * ((m.stock_item as { prix_moyen_pondere?: number }).prix_moyen_pondere ?? 0);
  return 0;
}

function getMotifPerte(note: string | null): string {
  if (!note) return 'Autre';
  return MOTIFS.find(mo => note.startsWith(mo)) ?? 'Autre';
}

const PERIODS = [
  { label: '7 j',   days: 7 },
  { label: '30 j',  days: 30 },
  { label: '3 mois', days: 90 },
  { label: '1 an',  days: 365 },
];

const MVT_TYPES: Record<string, { label: string; color: string; dir: 1 | -1 }> = {
  entree_facture:  { label: 'Entrée facture',  color: 'bg-blue-500',   dir:  1 },
  sortie_economat: { label: 'Économat',        color: 'bg-violet-500', dir: -1 },
  sortie_vente:    { label: 'Vente',           color: 'bg-indigo-500', dir: -1 },
  production:      { label: 'Production',      color: 'bg-cyan-500',   dir: -1 },
  perte:           { label: 'Perte',           color: 'bg-red-500',    dir: -1 },
  inventaire:      { label: 'Inventaire',      color: 'bg-gray-400',   dir:  1 },
  reservation:     { label: 'Réservation',     color: 'bg-orange-400', dir: -1 },
};

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' MAD';
}

function Bar({ pct, color = 'bg-blue-500' }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </div>
  );
}

function monthKey(d: string) { return d.slice(0, 7); }
function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(+y, +m - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysesStockPage() {
  const [items, setItems]         = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [recipes, setRecipes]     = useState<RecipeSheet[]>([]);
  const [loading, setLoading]     = useState(true);
  const [period, setPeriod]       = useState(30);
  const [tab, setTab]             = useState<'etat' | 'conso' | 'flux' | 'pertes'>('etat');

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - period);
    const sinceStr = since.toISOString().slice(0, 10);

    async function load() {
      // Essaie avec toutes les colonnes (y.c. colonnes PF), fallback sans si erreur
      let its: StockItem[] = [];
      const { data: fullData, error: fullError } = await supabase
        .from('stock_items')
        .select('id, nom, unite, item_type, stock_actuel, stock_min, prix_moyen_pondere, quantite_reservee, categorie, atelier')
        .order('nom');

      if (fullError) {
        // Colonnes PF absentes — fallback sur les colonnes de base
        const { data: baseData } = await supabase
          .from('stock_items')
          .select('id, nom, unite, stock_actuel, stock_min, prix_moyen_pondere, categorie')
          .order('nom');
        its = (baseData as StockItem[]) || [];
      } else {
        its = (fullData as StockItem[]) || [];
      }

      const [{ data: mvts }, { data: rec }] = await Promise.all([
        supabase
          .from('stock_movements')
          .select('*, stock_item:stock_items(nom, unite, item_type, prix_moyen_pondere, atelier)')
          .gte('date', sinceStr)
          .order('date', { ascending: false }),
        supabase.from('recipe_sheets').select('id, nom, type'),
      ]);

      setItems(its);
      setMovements((mvts as Movement[]) || []);
      setRecipes((rec as RecipeSheet[]) || []);
      setLoading(false);
    }

    load();
  }, [period]);

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const mp = items.filter(i => !i.item_type || i.item_type === 'mp');
    const pf = items.filter(i => i.item_type === 'pf');

    const valeurMP = mp.reduce((s, i) => s + Math.max(i.stock_actuel, 0) * (i.prix_moyen_pondere ?? 0), 0);
    const valeurPF = pf.reduce((s, i) => s + Math.max(i.stock_actuel, 0) * (i.prix_moyen_pondere ?? 0), 0);

    const rupturesMP = mp.filter(i => (i.stock_actuel ?? 0) <= 0).length;
    const alertesMP  = mp.filter(i => (i.stock_actuel ?? 0) > 0 && i.stock_actuel <= i.stock_min).length;
    const rupturesPF = pf.filter(i => (i.stock_actuel ?? 0) <= 0).length;

    const entrees = movements.filter(m => MVT_TYPES[m.type]?.dir === 1).reduce((s, m) => s + Math.abs(m.quantite), 0);
    const sorties = movements.filter(m => MVT_TYPES[m.type]?.dir === -1).reduce((s, m) => s + Math.abs(m.quantite), 0);
    const pertes  = movements.filter(m => m.type === 'perte').reduce((s, m) => s + Math.abs(m.quantite), 0);

    return { valeurMP, valeurPF, rupturesMP, alertesMP, rupturesPF, entrees, sorties, pertes };
  }, [items, movements]);

  // ── État du stock — répartition par catégorie ─────────────────────────────

  const byCategorie = useMemo(() => {
    const map: Record<string, { total: number; valeur: number; ruptures: number; alertes: number }> = {};
    items.filter(i => !i.item_type || i.item_type === 'mp').forEach(i => {
      const cat = i.categorie || 'Sans catégorie';
      if (!map[cat]) map[cat] = { total: 0, valeur: 0, ruptures: 0, alertes: 0 };
      map[cat].total++;
      map[cat].valeur += Math.max(i.stock_actuel, 0) * (i.prix_moyen_pondere ?? 0);
      if (i.stock_actuel <= 0) map[cat].ruptures++;
      else if (i.stock_actuel <= i.stock_min) map[cat].alertes++;
    });
    return Object.entries(map).sort((a, b) => b[1].valeur - a[1].valeur);
  }, [items]);

  const maxCatValeur = useMemo(() =>
    Math.max(...byCategorie.map(([, v]) => v.valeur), 1),
    [byCategorie]
  );

  // Valeur par article MP (top 15)
  const topValeurMP = useMemo(() =>
    items
      .filter(i => (!i.item_type || i.item_type === 'mp') && i.stock_actuel > 0)
      .map(i => ({ ...i, valeur: i.stock_actuel * (i.prix_moyen_pondere ?? 0) }))
      .sort((a, b) => b.valeur - a.valeur)
      .slice(0, 15),
    [items]
  );

  const maxValeurMP = useMemo(() =>
    Math.max(...topValeurMP.map(i => i.valeur), 1),
    [topValeurMP]
  );

  // ── Consommation — sorties économat par atelier ───────────────────────────

  const byAtelier = useMemo(() => {
    const map: Record<string, { total: number; articles: Record<string, number> }> = {};
    movements.filter(m => m.type === 'sortie_economat').forEach(m => {
      const atelier = m.note || 'Non précisé';
      const nom = m.stock_item?.nom ?? '—';
      if (!map[atelier]) map[atelier] = { total: 0, articles: {} };
      map[atelier].total += Math.abs(m.quantite);
      map[atelier].articles[nom] = (map[atelier].articles[nom] ?? 0) + Math.abs(m.quantite);
    });
    return Object.entries(map)
      .map(([atelier, d]) => ({
        atelier,
        total: d.total,
        articles: Object.entries(d.articles).sort((a, b) => b[1] - a[1]),
      }))
      .sort((a, b) => b.total - a.total);
  }, [movements]);

  // Top articles les plus consommés (économat + vente + production)
  const topConso = useMemo(() => {
    const map: Record<string, { nom: string; unite: string; qte: number }> = {};
    movements
      .filter(m => ['sortie_economat', 'sortie_vente', 'production'].includes(m.type))
      .forEach(m => {
        const id = m.stock_item_id;
        if (!map[id]) map[id] = { nom: m.stock_item?.nom ?? '—', unite: m.stock_item?.unite ?? '', qte: 0 };
        map[id].qte += Math.abs(m.quantite);
      });
    return Object.values(map).sort((a, b) => b.qte - a.qte).slice(0, 12);
  }, [movements]);

  const maxConso = useMemo(() =>
    Math.max(...topConso.map(a => a.qte), 1),
    [topConso]
  );

  // ── Flux — entrées/sorties par mois ──────────────────────────────────────

  const monthlyFlux = useMemo(() => {
    const map: Record<string, { entrees: number; sorties: number; pertes: number }> = {};
    movements.forEach(m => {
      const k = monthKey(m.date);
      if (!map[k]) map[k] = { entrees: 0, sorties: 0, pertes: 0 };
      const qty = Math.abs(m.quantite);
      if (MVT_TYPES[m.type]?.dir === 1) map[k].entrees += qty;
      else if (m.type === 'perte')       map[k].pertes  += qty;
      else                               map[k].sorties += qty;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [movements]);

  const maxFlux = useMemo(() =>
    Math.max(...monthlyFlux.flatMap(([, v]) => [v.entrees, v.sorties + v.pertes]), 1),
    [monthlyFlux]
  );

  // Répartition par type de mouvement
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    movements.forEach(m => { map[m.type] = (map[m.type] ?? 0) + 1; });
    return Object.entries(map)
      .map(([type, nb]) => ({ type, nb, cfg: MVT_TYPES[type] }))
      .sort((a, b) => b.nb - a.nb);
  }, [movements]);

  const maxType = useMemo(() =>
    Math.max(...byType.map(t => t.nb), 1),
    [byType]
  );

  // ── Pertes — analyse financière ──────────────────────────────────────────

  const pertesOnly = useMemo(() =>
    movements.filter(m => m.type === 'perte'),
    [movements]
  );

  const analysePertesCat = useMemo(() => {
    const acc: Record<string, { count: number; valeur: number }> = {
      mp: { count: 0, valeur: 0 }, pf: { count: 0, valeur: 0 },
      recette: { count: 0, valeur: 0 }, sous_recette: { count: 0, valeur: 0 },
    };
    for (const p of pertesOnly) {
      const val = getValeurPerte(p);
      const recetteNom = getRecetteNom(p.note);
      let cat: string;
      if (recetteNom) {
        const recipe = recipes.find(r => r.nom === recetteNom);
        cat = recipe?.type ?? 'recette';
      } else {
        cat = (p.stock_item as { item_type?: string } | null | undefined)?.item_type ?? 'mp';
      }
      if (acc[cat]) { acc[cat].count++; acc[cat].valeur += val; }
    }
    return acc;
  }, [pertesOnly, recipes]);

  const totalPertesValeur = useMemo(() =>
    Object.values(analysePertesCat).reduce((s, c) => s + c.valeur, 0),
    [analysePertesCat]
  );

  const analysePertesMois = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pertesOnly) {
      const k = p.date.slice(0, 7);
      map[k] = (map[k] ?? 0) + getValeurPerte(p);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [pertesOnly]);

  const maxPertesMois = useMemo(() =>
    Math.max(...analysePertesMois.map(([, v]) => v), 1),
    [analysePertesMois]
  );

  const analyseMotifs = useMemo(() => {
    const map: Record<string, { count: number; valeur: number }> = {};
    for (const p of pertesOnly) {
      const motif = getMotifPerte(p.note);
      if (!map[motif]) map[motif] = { count: 0, valeur: 0 };
      map[motif].count++;
      map[motif].valeur += getValeurPerte(p);
    }
    return Object.entries(map).sort((a, b) => b[1].valeur - a[1].valeur);
  }, [pertesOnly]);

  const maxMotifValeur = useMemo(() =>
    Math.max(...analyseMotifs.map(([, v]) => v.valeur), 1),
    [analyseMotifs]
  );

  const topArticlesPertes = useMemo(() => {
    const map: Record<string, { nom: string; count: number; valeur: number }> = {};
    for (const p of pertesOnly) {
      const recetteNom = getRecetteNom(p.note);
      const nom = recetteNom ?? p.stock_item?.nom ?? '—';
      if (!map[nom]) map[nom] = { nom, count: 0, valeur: 0 };
      map[nom].count++;
      map[nom].valeur += getValeurPerte(p);
    }
    return Object.values(map).sort((a, b) => b.valeur - a.valeur).slice(0, 10);
  }, [pertesOnly]);

  const maxArticleValeur = useMemo(() =>
    Math.max(...topArticlesPertes.map(a => a.valeur), 1),
    [topArticlesPertes]
  );

  const analyseAtelier = useMemo(() => {
    const map: Record<string, { count: number; valeur: number }> = {};
    for (const p of pertesOnly) {
      const atelier = (p.stock_item as { atelier?: string | null } | null | undefined)?.atelier ?? 'Non défini';
      if (!map[atelier]) map[atelier] = { count: 0, valeur: 0 };
      map[atelier].count++;
      map[atelier].valeur += getValeurPerte(p);
    }
    return Object.entries(map).sort((a, b) => b[1].valeur - a[1].valeur);
  }, [pertesOnly]);

  const maxAtelierValeur = useMemo(() =>
    Math.max(...analyseAtelier.map(([, v]) => v.valeur), 1),
    [analyseAtelier]
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Analyses stock</h2>
          <p className="text-sm text-gray-500 mt-0.5">État des stocks, consommation et flux de mouvements</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === p.days
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 col-span-2 lg:col-span-1">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <Warehouse size={18} className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 leading-none">{fmt(kpis.valeurMP + kpis.valeurPF)}</p>
          <p className="text-xs text-gray-500 mt-1">Valeur totale du stock</p>
          <p className="text-xs text-gray-400 mt-0.5">MP {fmt(kpis.valeurMP)} · PF {fmt(kpis.valeurPF)}</p>
        </div>

        <div className={`bg-white border rounded-2xl p-4 ${kpis.rupturesMP > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${kpis.rupturesMP > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
            <TrendingDown size={18} className={kpis.rupturesMP > 0 ? 'text-red-500' : 'text-gray-400'} />
          </div>
          <p className={`text-2xl font-bold leading-none ${kpis.rupturesMP > 0 ? 'text-red-600' : 'text-gray-900'}`}>{kpis.rupturesMP}</p>
          <p className="text-xs text-gray-500 mt-1">Ruptures MP</p>
          {kpis.rupturesPF > 0 && <p className="text-xs text-gray-400 mt-0.5">+{kpis.rupturesPF} PF</p>}
        </div>

        <div className={`bg-white border rounded-2xl p-4 ${kpis.alertesMP > 0 ? 'border-orange-200' : 'border-gray-200'}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${kpis.alertesMP > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
            <AlertTriangle size={18} className={kpis.alertesMP > 0 ? 'text-orange-500' : 'text-gray-400'} />
          </div>
          <p className={`text-2xl font-bold leading-none ${kpis.alertesMP > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{kpis.alertesMP}</p>
          <p className="text-xs text-gray-500 mt-1">Alertes seuil MP</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center mb-3">
            <Flame size={18} className="text-red-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 leading-none">{kpis.pertes.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</p>
          <p className="text-xs text-gray-500 mt-1">Pertes (unités)</p>
          <p className="text-xs text-gray-400 mt-0.5">Sur la période</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'etat',   label: 'État du stock',     icon: BarChart2 },
            { key: 'conso',  label: 'Consommation',      icon: ArrowUpRight },
            { key: 'flux',   label: 'Flux & mouvements', icon: RefreshCw },
            { key: 'pertes', label: 'Pertes',            icon: Flame },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === key
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-800'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ── Onglet État du stock ── */}
          {tab === 'etat' && (
            <div className="space-y-8">

              {/* Synthèse MP / PF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package size={16} className="text-blue-600" />
                    <span className="text-sm font-semibold text-blue-700">Matières premières</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-600">Total articles</span>
                      <span className="font-semibold text-blue-900">{items.filter(i => !i.item_type || i.item_type === 'mp').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600">En stock normal</span>
                      <span className="font-semibold text-blue-900">{items.filter(i => (!i.item_type || i.item_type === 'mp') && i.stock_actuel > i.stock_min).length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">Ruptures</span>
                      <span className="font-semibold text-red-700">{kpis.rupturesMP}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-500">Alertes seuil</span>
                      <span className="font-semibold text-orange-700">{kpis.alertesMP}</span>
                    </div>
                    <div className="pt-1.5 border-t border-blue-200 flex justify-between">
                      <span className="text-blue-700 font-medium">Valeur totale</span>
                      <span className="font-bold text-blue-900">{fmt(kpis.valeurMP)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-violet-50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingBag size={16} className="text-violet-600" />
                    <span className="text-sm font-semibold text-violet-700">Produits finis</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-violet-600">Total articles</span>
                      <span className="font-semibold text-violet-900">{items.filter(i => i.item_type === 'pf').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-violet-600">En stock</span>
                      <span className="font-semibold text-violet-900">{items.filter(i => i.item_type === 'pf' && i.stock_actuel > 0).length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500">Ruptures</span>
                      <span className="font-semibold text-red-700">{kpis.rupturesPF}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-violet-600">Réservés</span>
                      <span className="font-semibold text-violet-900">{items.filter(i => i.item_type === 'pf' && ((i.quantite_reservee ?? 0) > 0)).length} art.</span>
                    </div>
                    {items.filter(i => i.item_type === 'pf').length === 0 && (
                      <p className="text-xs text-violet-400 italic">Migration PF non encore appliquée</p>
                    )}
                    <div className="pt-1.5 border-t border-violet-200 flex justify-between">
                      <span className="text-violet-700 font-medium">Valeur totale</span>
                      <span className="font-bold text-violet-900">{fmt(kpis.valeurPF)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Valeur par catégorie */}
              {byCategorie.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Valeur MP par catégorie</h3>
                  <div className="space-y-3">
                    {byCategorie.map(([cat, data]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 font-medium w-36 truncate shrink-0">{cat}</span>
                        <div className="flex-1">
                          <Bar pct={(data.valeur / maxCatValeur) * 100} color="bg-blue-500" />
                        </div>
                        <div className="text-right shrink-0 w-28">
                          <span className="text-sm font-semibold text-gray-900">{fmt(data.valeur)}</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {data.ruptures > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">{data.ruptures} rup.</span>
                          )}
                          {data.alertes > 0 && (
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-bold">{data.alertes} al.</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top 15 articles par valeur */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Top articles MP par valeur en stock</h3>
                {topValeurMP.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun article en stock.</p>
                ) : (
                  <div className="space-y-3">
                    {topValeurMP.map((item, i) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-mono w-5 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-800 truncate">{item.nom}</span>
                            <div className="flex items-center gap-3 shrink-0 ml-3">
                              <span className="text-xs text-gray-400">{item.stock_actuel} {item.unite}</span>
                              <span className="text-sm font-semibold text-gray-900 w-24 text-right">{fmt(item.valeur)}</span>
                            </div>
                          </div>
                          <Bar pct={(item.valeur / maxValeurMP) * 100} color="bg-blue-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Onglet Consommation ── */}
          {tab === 'conso' && (
            <div className="space-y-8">

              {/* Top articles consommés */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-gray-400" />
                  Articles les plus consommés
                  <span className="ml-auto text-xs font-normal text-gray-400">(économat + vente + production)</span>
                </h3>
                {topConso.length === 0 ? (
                  <div className="text-center py-10">
                    <ClipboardList size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Aucune sortie enregistrée sur cette période</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topConso.map((a, i) => (
                      <div key={a.nom + i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-mono w-5 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-800 truncate">{a.nom}</span>
                            <span className="text-sm font-semibold text-gray-900 shrink-0 ml-3">
                              {a.qte.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} {a.unite}
                            </span>
                          </div>
                          <Bar pct={(a.qte / maxConso) * 100} color="bg-violet-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sorties par atelier */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <ClipboardList size={14} className="text-gray-400" />
                  Consommation par atelier (économat)
                </h3>
                {byAtelier.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucune sortie économat sur cette période.</p>
                ) : (
                  <div className="space-y-4">
                    {byAtelier.map(a => (
                      <div key={a.atelier} className="bg-gray-50 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold text-gray-800">{a.atelier}</span>
                          <span className="text-xs text-gray-500">{a.articles.length} article{a.articles.length > 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-2">
                          {a.articles.slice(0, 8).map(([nom, qty]) => {
                            const pct = (qty / a.articles[0][1]) * 100;
                            return (
                              <div key={nom} className="flex items-center gap-3">
                                <span className="text-xs text-gray-600 w-40 truncate shrink-0">{nom}</span>
                                <div className="flex-1">
                                  <Bar pct={pct} color="bg-violet-400" />
                                </div>
                                <span className="text-xs font-semibold text-gray-700 w-14 text-right shrink-0">
                                  {qty.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                                </span>
                              </div>
                            );
                          })}
                          {a.articles.length > 8 && (
                            <p className="text-xs text-gray-400 pt-1">+{a.articles.length - 8} autres articles</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Onglet Flux ── */}
          {tab === 'flux' && (
            <div className="space-y-8">

              {/* Flux mensuels */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Flux mensuels (entrées vs sorties)</h3>
                {monthlyFlux.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun mouvement sur cette période.</p>
                ) : (
                  <div className="space-y-4">
                    {monthlyFlux.map(([key, val]) => (
                      <div key={key} className="space-y-1.5">
                        <span className="text-xs font-semibold text-gray-500">{monthLabel(key)}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-blue-600 w-14 shrink-0">Entrées</span>
                          <div className="flex-1">
                            <Bar pct={(val.entrees / maxFlux) * 100} color="bg-blue-500" />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-20 text-right shrink-0">
                            {val.entrees.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-violet-600 w-14 shrink-0">Sorties</span>
                          <div className="flex-1">
                            <Bar pct={(val.sorties / maxFlux) * 100} color="bg-violet-500" />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-20 text-right shrink-0">
                            {val.sorties.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        {val.pertes > 0 && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-red-500 w-14 shrink-0">Pertes</span>
                            <div className="flex-1">
                              <Bar pct={(val.pertes / maxFlux) * 100} color="bg-red-400" />
                            </div>
                            <span className="text-xs font-semibold text-red-600 w-20 text-right shrink-0">
                              {val.pertes.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Répartition par type de mouvement */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <RefreshCw size={14} className="text-gray-400" />
                  Répartition par type de mouvement
                </h3>
                {byType.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun mouvement.</p>
                ) : (
                  <div className="space-y-3">
                    {byType.map(({ type, nb, cfg }) => (
                      <div key={type} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 w-36 shrink-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg?.color ?? 'bg-gray-400'}`} />
                          <span className="text-xs text-gray-600 font-medium truncate">{cfg?.label ?? type}</span>
                        </div>
                        <div className="flex-1">
                          <Bar pct={(nb / maxType) * 100} color={cfg?.color ?? 'bg-gray-400'} />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 w-12 text-right shrink-0">{nb}</span>
                        <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                          {((nb / movements.length) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Résumé flux totaux */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-2xl p-4 text-center">
                  <ArrowDownLeft size={20} className="text-blue-600 mx-auto mb-2" />
                  <p className="text-xl font-bold text-blue-700">
                    {kpis.entrees.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">Unités entrées</p>
                </div>
                <div className="bg-violet-50 rounded-2xl p-4 text-center">
                  <ArrowUpRight size={20} className="text-violet-600 mx-auto mb-2" />
                  <p className="text-xl font-bold text-violet-700">
                    {kpis.sorties.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-violet-600 mt-0.5">Unités sorties</p>
                </div>
                <div className="bg-red-50 rounded-2xl p-4 text-center">
                  <Flame size={20} className="text-red-400 mx-auto mb-2" />
                  <p className="text-xl font-bold text-red-600">
                    {kpis.pertes.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">Unités perdues</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Onglet Pertes ── */}
          {tab === 'pertes' && (
            <div className="space-y-8">

              {pertesOnly.length === 0 ? (
                <div className="text-center py-12">
                  <Flame size={32} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Aucune perte enregistrée sur cette période</p>
                </div>
              ) : (
                <>
                  {/* KPI pertes */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="bg-red-50 rounded-2xl p-4">
                      <p className="text-2xl font-black text-red-600 leading-none">
                        {totalPertesValeur > 0 ? `-${fmtMAD(totalPertesValeur)}` : '—'}
                      </p>
                      <p className="text-xs text-red-500 mt-1">Valeur totale perdue</p>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-2xl font-black text-gray-800 leading-none">{pertesOnly.length}</p>
                      <p className="text-xs text-gray-500 mt-1">Déclarations de perte</p>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 col-span-2 sm:col-span-1">
                      <p className="text-2xl font-black text-gray-800 leading-none">
                        {pertesOnly.length > 0 ? fmtMAD(totalPertesValeur / pertesOnly.length) : '—'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Coût moyen par perte</p>
                    </div>
                  </div>

                  {/* Répartition par catégorie */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Répartition financière par catégorie</h3>
                    {totalPertesValeur > 0 && (
                      <div className="flex rounded-lg overflow-hidden h-4 gap-0.5 mb-4">
                        {Object.entries(CAT_PERTES).map(([key, cfg]) => {
                          const pct = totalPertesValeur > 0 ? (analysePertesCat[key].valeur / totalPertesValeur) * 100 : 0;
                          return pct > 0 ? (
                            <div key={key} className={`${cfg.bar} rounded-sm`} style={{ width: `${pct}%` }}
                              title={`${cfg.label} : ${pct.toFixed(1)}%`} />
                          ) : null;
                        })}
                      </div>
                    )}
                    <div className="space-y-3">
                      {Object.entries(CAT_PERTES).map(([key, cfg]) => {
                        const { count, valeur } = analysePertesCat[key];
                        if (count === 0) return null;
                        const pct = totalPertesValeur > 0 ? (valeur / totalPertesValeur) * 100 : 0;
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
                            <span className="text-sm text-gray-700 flex-1 font-medium">{cfg.label}</span>
                            <span className="text-xs text-gray-400">{count} perte{count > 1 ? 's' : ''}</span>
                            <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
                            <span className={`text-sm font-bold ${cfg.color} w-32 text-right tabular-nums`}>
                              {valeur > 0 ? `-${fmtMAD(valeur)}` : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Répartition par motif */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Répartition par motif</h3>
                    <div className="space-y-3">
                      {analyseMotifs.map(([motif, data]) => (
                        <div key={motif} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 font-medium w-24 shrink-0">{motif}</span>
                          <div className="flex-1">
                            <Bar pct={(data.valeur / maxMotifValeur) * 100} color="bg-red-400" />
                          </div>
                          <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                            {data.count} oc.
                          </span>
                          <span className="text-sm font-semibold text-red-600 w-32 text-right shrink-0 tabular-nums">
                            {data.valeur > 0 ? `-${fmtMAD(data.valeur)}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top articles perdus */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Articles les plus coûteux en pertes</h3>
                    <div className="space-y-3">
                      {topArticlesPertes.map((a, i) => (
                        <div key={a.nom + i} className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 font-mono w-5 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-800 truncate">{a.nom}</span>
                              <div className="flex items-center gap-3 shrink-0 ml-3">
                                <span className="text-xs text-gray-400">{a.count} décl.</span>
                                <span className="text-sm font-bold text-red-600 w-28 text-right tabular-nums">
                                  {a.valeur > 0 ? `-${fmtMAD(a.valeur)}` : '—'}
                                </span>
                              </div>
                            </div>
                            <Bar pct={(a.valeur / maxArticleValeur) * 100} color="bg-red-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Répartition par atelier */}
                  {analyseAtelier.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-4">Répartition par atelier</h3>
                      <div className="space-y-3">
                        {analyseAtelier.map(([atelier, data]) => (
                          <div key={atelier} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 font-medium w-28 truncate shrink-0">{atelier}</span>
                            <div className="flex-1">
                              <Bar pct={(data.valeur / maxAtelierValeur) * 100} color="bg-red-300" />
                            </div>
                            <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                              {data.count} décl.
                            </span>
                            <span className="text-sm font-bold text-red-600 w-32 text-right shrink-0 tabular-nums">
                              {data.valeur > 0 ? `-${fmtMAD(data.valeur)}` : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Évolution mensuelle */}
                  {analysePertesMois.length > 1 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-4">Évolution mensuelle des pertes</h3>
                      <div className="space-y-3">
                        {analysePertesMois.map(([key, val]) => (
                          <div key={key} className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-gray-500 w-16 shrink-0">{monthLabel(key)}</span>
                            <div className="flex-1">
                              <Bar pct={(val / maxPertesMois) * 100} color="bg-red-400" />
                            </div>
                            <span className="text-sm font-bold text-red-600 w-32 text-right shrink-0 tabular-nums">
                              {val > 0 ? `-${fmtMAD(val)}` : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
