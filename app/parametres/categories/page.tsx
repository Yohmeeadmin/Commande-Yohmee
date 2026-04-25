'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useAteliers, refreshAteliers, type AtelierDB } from '@/lib/useAteliers';

interface Category {
  id: string;
  nom: string;
  atelier: string;
  ordre: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ─── Ateliers Tab ─────────────────────────────────────────────────────────────

function AteliersTab() {
  const { ateliers } = useAteliers();
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [newBg, setNewBg] = useState('#F3F4F6');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editBg, setEditBg] = useState('');

  async function addAtelier() {
    if (!newLabel.trim()) return;
    setAdding(true);
    const value = slugify(newLabel.trim());
    const maxOrder = ateliers.reduce((m, a) => Math.max(m, a.sort_order), 0);
    await supabase.from('ateliers').insert({
      value,
      label: newLabel.trim(),
      color: newColor,
      bg_color: newBg,
      sort_order: maxOrder + 1,
    });
    await refreshAteliers();
    setNewLabel('');
    setNewColor('#6B7280');
    setNewBg('#F3F4F6');
    setAdding(false);
  }

  async function saveEdit(id: string) {
    await supabase.from('ateliers').update({ label: editLabel, color: editColor, bg_color: editBg }).eq('id', id);
    await refreshAteliers();
    setEditingId(null);
  }

  async function deleteAtelier(atelier: AtelierDB) {
    const { count } = await supabase
      .from('product_references')
      .select('id', { count: 'exact', head: true })
      .eq('atelier', atelier.value);
    if ((count ?? 0) > 0) {
      alert(`Cet atelier est utilisé par ${count} produit${count! > 1 ? 's' : ''}. Réassignez-les avant de supprimer.`);
      return;
    }
    await supabase.from('ateliers').delete().eq('id', atelier.id);
    await refreshAteliers();
  }

  async function move(atelier: AtelierDB, dir: 'up' | 'down') {
    const sorted = [...ateliers].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(a => a.id === atelier.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      supabase.from('ateliers').update({ sort_order: other.sort_order }).eq('id', atelier.id),
      supabase.from('ateliers').update({ sort_order: atelier.sort_order }).eq('id', other.id),
    ]);
    await refreshAteliers();
  }

  const sorted = [...ateliers].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-3">
      {sorted.map((atelier, i) => (
        <div key={atelier.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl group">
          {/* Ordre */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={() => move(atelier, 'up')} disabled={i === 0}
              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none text-xs">▲</button>
            <button onClick={() => move(atelier, 'down')} disabled={i === sorted.length - 1}
              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none text-xs">▼</button>
          </div>

          {/* Pastille couleur */}
          <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: editingId === atelier.id ? editBg : atelier.bg_color, color: editingId === atelier.id ? editColor : atelier.color }}>
            {(editingId === atelier.id ? editLabel : atelier.label).charAt(0).toUpperCase()}
          </div>

          {/* Contenu */}
          {editingId === atelier.id ? (
            <div className="flex-1 flex items-center gap-2">
              <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(atelier.id); if (e.key === 'Escape') setEditingId(null); }}
                className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex items-center gap-1.5 shrink-0">
                <label className="text-xs text-gray-500">Texte</label>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200" />
                <label className="text-xs text-gray-500">Fond</label>
                <input type="color" value={editBg} onChange={e => setEditBg(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200" />
              </div>
            </div>
          ) : (
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{atelier.label}</p>
              <p className="text-xs text-gray-400 font-mono">{atelier.value}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {editingId === atelier.id ? (
              <>
                <button onClick={() => saveEdit(atelier.id)}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"><Check size={15} /></button>
                <button onClick={() => setEditingId(null)}
                  className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"><X size={15} /></button>
              </>
            ) : (
              <>
                <button onClick={() => { setEditingId(atelier.id); setEditLabel(atelier.label); setEditColor(atelier.color); setEditBg(atelier.bg_color); }}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={15} /></button>
                <button onClick={() => deleteAtelier(atelier)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Ajouter */}
      <div className="pt-2 space-y-2">
        <div className="flex gap-2">
          <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAtelier(); } }}
            placeholder="Nom de l'atelier (ex: Viennoiserie)…"
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex items-center gap-1.5 px-3 bg-gray-50 border border-gray-200 rounded-xl">
            <label className="text-xs text-gray-500 whitespace-nowrap">Texte</label>
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
            <label className="text-xs text-gray-500 whitespace-nowrap">Fond</label>
            <input type="color" value={newBg} onChange={e => setNewBg(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
          </div>
          <button onClick={addAtelier} disabled={adding || !newLabel.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Plus size={16} /> Ajouter
          </button>
        </div>
        {newLabel.trim() && (
          <p className="text-xs text-gray-400 pl-1">
            Identifiant généré : <span className="font-mono text-gray-600">{slugify(newLabel)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab() {
  const { ateliers } = useAteliers();
  const sorted = [...ateliers].sort((a, b) => a.sort_order - b.sort_order);
  const [activeAtelier, setActiveAtelier] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (sorted.length > 0 && !activeAtelier) setActiveAtelier(sorted[0].value);
  }, [sorted]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('categories').select('*').order('ordre');
    setCategories(data || []);
    setLoading(false);
  }

  const filtered = categories.filter(c => c.atelier === activeAtelier).sort((a, b) => a.ordre - b.ordre);

  async function addCategory() {
    if (!newName.trim() || !activeAtelier) return;
    setAdding(true);
    const maxOrdre = filtered.reduce((m, c) => Math.max(m, c.ordre), 0);
    const { data, error } = await supabase
      .from('categories')
      .insert({ nom: newName.trim(), atelier: activeAtelier, ordre: maxOrdre + 1 })
      .select().single();
    if (!error && data) { setCategories(prev => [...prev, data]); setNewName(''); }
    setAdding(false);
  }

  async function deleteCategory(id: string) {
    const { count } = await supabase.from('product_references').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if ((count ?? 0) > 0) {
      const ok = confirm(`${count} produit${count! > 1 ? 's' : ''} utilise${count! > 1 ? 'nt' : ''} cette catégorie. La supprimer retirera la catégorie de ces produits (sans les supprimer). Continuer ?`);
      if (!ok) return;
      await supabase.from('product_references').update({ category_id: null }).eq('category_id', id);
    }
    await supabase.from('categories').delete().eq('id', id);
    setCategories(prev => prev.filter(c => c.id !== id));
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    await supabase.from('categories').update({ nom: editName.trim() }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, nom: editName.trim() } : c));
    setEditingId(null);
  }

  async function move(cat: Category, dir: 'up' | 'down') {
    const idx = filtered.findIndex(c => c.id === cat.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filtered.length) return;
    const other = filtered[swapIdx];
    await Promise.all([
      supabase.from('categories').update({ ordre: other.ordre }).eq('id', cat.id),
      supabase.from('categories').update({ ordre: cat.ordre }).eq('id', other.id),
    ]);
    setCategories(prev => prev.map(c => {
      if (c.id === cat.id) return { ...c, ordre: other.ordre };
      if (c.id === other.id) return { ...c, ordre: cat.ordre };
      return c;
    }));
  }

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Sous-onglets ateliers */}
      <div className="flex flex-wrap gap-2">
        {sorted.map(atelier => (
          <button key={atelier.value} onClick={() => setActiveAtelier(atelier.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeAtelier === atelier.value ? 'shadow-sm' : 'opacity-50 hover:opacity-80'
            }`}
            style={{
              backgroundColor: activeAtelier === atelier.value ? atelier.bg_color : '#F9FAFB',
              color: activeAtelier === atelier.value ? atelier.color : '#6B7280',
            }}>
            {atelier.label}
            <span className="text-xs font-normal opacity-70">({categories.filter(c => c.atelier === atelier.value).length})</span>
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {filtered.map((cat, i) => (
          <div key={cat.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl group">
            <div className="flex flex-col gap-0.5 shrink-0">
              <button onClick={() => move(cat, 'up')} disabled={i === 0}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none text-xs">▲</button>
              <button onClick={() => move(cat, 'down')} disabled={i === filtered.length - 1}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none text-xs">▼</button>
            </div>

            {editingId === cat.id ? (
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id); if (e.key === 'Escape') setEditingId(null); }}
                className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            ) : (
              <span className="flex-1 text-sm font-medium text-gray-800">{cat.nom}</span>
            )}

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {editingId === cat.id ? (
                <>
                  <button onClick={() => saveEdit(cat.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={15} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={15} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingId(cat.id); setEditName(cat.nom); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={15} /></button>
                  <button onClick={() => deleteCategory(cat.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                </>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Aucune catégorie pour cet atelier.</p>
        )}

        <div className="flex gap-2 pt-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
            placeholder={`Nouvelle catégorie…`}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={addCategory} disabled={adding || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { profile } = useUser();
  const [tab, setTab] = useState<'ateliers' | 'categories'>('ateliers');

  if (profile?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/parametres" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ateliers & Catégories</h1>
          <p className="text-gray-500 mt-0.5 text-sm">Gérer les ateliers et organiser les produits par catégorie</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Onglets */}
        <div className="flex border-b border-gray-100">
          <button onClick={() => setTab('ateliers')}
            className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'ateliers' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            Ateliers
          </button>
          <button onClick={() => setTab('categories')}
            className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'categories' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            Catégories
          </button>
        </div>

        <div className="p-6">
          {tab === 'ateliers' ? <AteliersTab /> : <CategoriesTab />}
        </div>
      </div>
    </div>
  );
}
