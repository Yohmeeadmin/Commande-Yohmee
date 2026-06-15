'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Star, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngLine {
  id: string;
  quantite: number;
  stock_item_id: string | null;
  sous_recipe_id: string | null;
  stock_item: { nom: string; unite: string } | null;
  sous_recipe: { nom: string } | null;
}

interface Recipe {
  id: string;
  nom: string;
  type: string;
  rendement: number;
  perte_pct: number;
  poids_portion_g: number | null;
  unite: string | null;
  atelier: string | null;
  categorie: string | null;
  created_at?: string;
  ingredients: IngLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Recipe Card ──────────────────────────────────────────────────────────────

const TAG_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-amber-100 text-amber-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % TAG_COLORS.length;
  return TAG_COLORS[h];
}

function RecipeCard({
  recipe, selected, onSelect, onOpen, starred, onStar,
}: {
  recipe: Recipe;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onOpen: () => void;
  starred: boolean;
  onStar: () => void;
}) {
  const tag = recipe.categorie || recipe.atelier || null;
  const nbIng = (recipe.ingredients || []).length;

  return (
    <div
      onClick={onOpen}
      className={`relative bg-white rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md group ${selected ? 'border-amber-400' : 'border-gray-100 hover:border-amber-200'}`}
      style={{ borderTop: '4px solid #f59e0b' }}
    >
      {/* Top row: star + checkbox */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <button
          onClick={e => { e.stopPropagation(); onStar(); }}
          className="p-1 rounded-lg hover:bg-amber-50 transition-colors"
        >
          <Star
            size={16}
            className={starred ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-400'}
          />
        </button>
        <div
          onClick={e => { e.stopPropagation(); onSelect(!selected); }}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${selected ? 'bg-amber-400 border-amber-400' : 'border-amber-300 hover:border-amber-400'}`}
        >
          {selected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-2">
        <p className="font-bold text-gray-900 text-base leading-snug mb-2">{recipe.nom}</p>
        {tag ? (
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg ${tagColor(tag)}`}>{tag}</span>
        ) : (
          <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-400">Sans tag</span>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-amber-200" />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-400">
        <span>{fmtDate(recipe.created_at)}</span>
        <span>{nbIng} ingrédient{nbIng > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FichesRecettesPage() {
  const [recipes, setRecipes]     = useState<Recipe[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterType, setFilterType]       = useState('');
  const [filterAtelier, setFilterAtelier] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [starred, setStarred]     = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('recipe_sheets')
      .select(`
        id, nom, type, rendement, perte_pct, poids_portion_g, unite, atelier, categorie, created_at,
        ingredients:recipe_ingredients!recipe_sheet_id(
          id, quantite, stock_item_id, sous_recipe_id,
          stock_item:stock_items(nom, unite),
          sous_recipe:recipe_sheets!sous_recipe_id(nom)
        )
      `)
      .order('nom');
    setRecipes((data as Recipe[]) || []);
    setLoading(false);
  }

  const ateliers    = useMemo(() => [...new Set(recipes.map(r => r.atelier).filter(Boolean) as string[])].sort(), [recipes]);
  const categories  = useMemo(() => [...new Set(recipes.map(r => r.categorie).filter(Boolean) as string[])].sort(), [recipes]);

  const displayed = useMemo(() => {
    const q = search.toLowerCase();
    return recipes.filter(r => {
      if (q && !r.nom.toLowerCase().includes(q)) return false;
      if (filterType && r.type !== filterType) return false;
      if (filterAtelier && r.atelier !== filterAtelier) return false;
      if (filterCategorie && r.categorie !== filterCategorie) return false;
      return true;
    });
  }, [recipes, search, filterType, filterAtelier, filterCategorie]);

  const allSelected = displayed.length > 0 && displayed.every(r => selected.has(r.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); displayed.forEach(r => n.delete(r.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); displayed.forEach(r => n.add(r.id)); return n; });
    }
  }

  function toggleSelect(id: string, v: boolean) {
    setSelected(prev => { const n = new Set(prev); v ? n.add(id) : n.delete(id); return n; });
  }

  function toggleStar(id: string) {
    setStarred(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const hasFilters = !!(filterType || filterAtelier || filterCategorie);

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Chargement…</div>
  );

  return (
    <div className="space-y-5">


      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900 flex-1">
          Fiches recettes
          <span className="text-sm font-normal text-gray-400 ml-2">{displayed.length} résultat{displayed.length > 1 ? 's' : ''}</span>
        </h1>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
            className="pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400 bg-white w-52" />
        </div>
        <Link href="/recettes"
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors">
          <Plus size={15} /> Nouvelle recette
        </Link>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {[
            { v: '', label: 'Toutes' },
            { v: 'recette', label: 'Recettes' },
            { v: 'sous_recette', label: 'Sous-recettes' },
          ].map(opt => (
            <button key={opt.v} onClick={() => setFilterType(opt.v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filterType === opt.v ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {ateliers.length > 0 && (
          <select value={filterAtelier} onChange={e => setFilterAtelier(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-600 focus:outline-none focus:border-amber-400">
            <option value="">Tous ateliers</option>
            {ateliers.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}

        {categories.length > 0 && (
          <select value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-600 focus:outline-none focus:border-amber-400">
            <option value="">Toutes catégories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {hasFilters && (
          <button onClick={() => { setFilterType(''); setFilterAtelier(''); setFilterCategorie(''); }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2">
            Réinitialiser ×
          </button>
        )}
      </div>

      {/* Select all + print selected */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none" onClick={toggleSelectAll}>
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${allSelected ? 'bg-amber-400 border-amber-400' : 'border-gray-300 hover:border-amber-400'}`}>
            {allSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <span className="text-sm font-medium text-gray-600">Sélectionner</span>
        </label>
        {selected.size > 0 && (
          <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded-lg">
            {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Grid */}
      {displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400">Aucune recette trouvée</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              selected={selected.has(recipe.id)}
              onSelect={v => toggleSelect(recipe.id, v)}
              onOpen={() => router.push(`/recettes/fiches/${recipe.id}`)}
              starred={starred.has(recipe.id)}
              onStar={() => toggleStar(recipe.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
