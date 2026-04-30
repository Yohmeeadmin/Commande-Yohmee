'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Check, X, Pencil, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  woocommerce_url: string | null;
  created_at: string;
}

export default function EntreprisesPage() {
  const { profile } = useUser();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Ajout
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // Édition
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    const { data } = await supabase.from('companies').select('*').order('name');
    setCompanies(data || []);
    setLoading(false);
  }

  function slugify(s: string) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function addCompany() {
    if (!newName.trim()) return;
    setAdding(true);
    const { data, error } = await supabase
      .from('companies')
      .insert({ name: newName.trim(), slug: slugify(newName.trim()) })
      .select()
      .single();
    if (error) {
      alert(`Erreur : ${error.message}`);
    } else if (data) {
      setCompanies(prev => [...prev, data as Company].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
    }
    setAdding(false);
  }

  function startEdit(company: Company) {
    setEditingId(company.id);
    setEditName(company.name);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from('companies')
      .update({ name: editName.trim(), slug: slugify(editName.trim()) })
      .eq('id', id);
    if (error) { alert(`Erreur : ${error.message}`); return; }
    setCompanies(prev =>
      prev.map(c => c.id === id ? { ...c, name: editName.trim(), slug: slugify(editName.trim()) } : c)
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
  }

  async function deleteCompany(company: Company) {
    // Vérifier si des produits ou clients lui sont rattachés
    const [{ count: prodCount }, { count: clientCount }] = await Promise.all([
      supabase.from('product_references').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
    ]);
    const total = (prodCount ?? 0) + (clientCount ?? 0);
    if (total > 0) {
      alert(`Impossible de supprimer "${company.name}" : ${total} enregistrement(s) y sont rattachés (produits, clients).`);
      return;
    }
    if (!confirm(`Supprimer l'entreprise "${company.name}" ?`)) return;
    const { error } = await supabase.from('companies').delete().eq('id', company.id);
    if (error) { alert(`Erreur : ${error.message}`); return; }
    setCompanies(prev => prev.filter(c => c.id !== company.id));
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/parametres" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entreprises</h1>
          <p className="text-gray-500 mt-1">Gérer les entreprises du catalogue et des clients</p>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Building2 size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucune entreprise</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {companies.map(company => (
              <li key={company.id} className="flex items-center justify-between px-5 py-4">
                {editingId === company.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(company.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => saveEdit(company.id)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{company.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{company.slug}</p>
                    </div>
                  </div>
                )}

                {editingId !== company.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(company)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => deleteCompany(company)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Formulaire ajout */}
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Ajouter une entreprise</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCompany()}
              placeholder="Nom de l'entreprise (ex: Mazette)"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addCompany}
              disabled={!newName.trim() || adding}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {adding ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus size={18} />
              )}
            </button>
          </div>
          {newName.trim() && (
            <p className="text-xs text-gray-400 mt-1.5">
              Slug : <span className="font-mono">{slugify(newName)}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
