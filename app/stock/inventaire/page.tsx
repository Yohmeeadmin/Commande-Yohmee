'use client';

import { useEffect, useState } from 'react';
import { ScanLine, CheckCircle, Plus, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface StockItem { id: string; nom: string; unite: string; stock_actuel: number; supplier?: { nom: string } | null; }
interface InventoryLine { stock_item_id: string; nom: string; unite: string; stock_theorique: number; stock_reel: number; }

export default function InventairePage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(false);
  const [lines, setLines] = useState<InventoryLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('stock_items').select('*, supplier:suppliers(nom)').order('nom');
    setItems(data || []);
    setLoading(false);
  }

  function startInventaire() {
    setLines(items.map(i => ({ stock_item_id: i.id, nom: i.nom, unite: i.unite, stock_theorique: i.stock_actuel, stock_reel: i.stock_actuel })));
    setSession(true);
    setDone(false);
  }

  function updateReel(id: string, val: number) {
    setLines(p => p.map(l => l.stock_item_id === id ? { ...l, stock_reel: val } : l));
  }

  const ecarts = lines.filter(l => l.stock_reel !== l.stock_theorique);

  async function valider() {
    if (!confirm(`Valider l'inventaire ? ${ecarts.length} écart(s) seront corrigés.`)) return;
    setSaving(true);
    const date = new Date().toISOString().slice(0, 10);

    for (const line of lines) {
      if (line.stock_reel === line.stock_theorique) continue;
      const diff = line.stock_reel - line.stock_theorique;
      await supabase.from('stock_items').update({ stock_actuel: line.stock_reel }).eq('id', line.stock_item_id);
      await supabase.from('stock_movements').insert({ stock_item_id: line.stock_item_id, type: 'inventaire', quantite: diff, reference_type: 'inventory', date, note: `Inventaire — théorique: ${line.stock_theorique}, réel: ${line.stock_reel}` });
    }

    setSaving(false);
    setSession(false);
    setDone(true);
    load();
  }

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventaire</h1>
          <p className="text-sm text-gray-400">{items.length} article{items.length > 1 ? 's' : ''} à inventorier</p>
        </div>
        {!session && (
          <button onClick={startInventaire} disabled={items.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            <ScanLine size={15} /> Démarrer
          </button>
        )}
      </div>

      {done && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CheckCircle size={18} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-700 font-medium">Inventaire validé avec succès. Le stock a été mis à jour.</p>
        </div>
      )}

      {!session && !done && items.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
          <ScanLine className="text-gray-200 mx-auto" size={40} />
          <div>
            <p className="font-semibold text-gray-700">Prêt à faire l'inventaire</p>
            <p className="text-sm text-gray-400 mt-1">Le stock théorique sera pré-rempli. Saisissez le stock réel pour chaque article.</p>
          </div>
          <button onClick={startInventaire} className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
            <ScanLine size={16} /> Démarrer l'inventaire
          </button>
        </div>
      )}

      {session && (
        <>
          {ecarts.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700">
              <AlertTriangle size={14} className="shrink-0" />
              {ecarts.length} écart{ecarts.length > 1 ? 's' : ''} détecté{ecarts.length > 1 ? 's' : ''}
            </div>
          )}

          <div className="space-y-2">
            {lines.map(line => {
              const ecart = line.stock_reel - line.stock_theorique;
              const hasEcart = ecart !== 0;
              return (
                <div key={line.stock_item_id} className={`bg-white rounded-2xl border px-4 py-3 ${hasEcart ? 'border-orange-200' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{line.nom}</p>
                      <p className="text-xs text-gray-400">Théorique : {line.stock_theorique} {line.unite}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => updateReel(line.stock_item_id, Math.max(0, line.stock_reel - 1))}
                        className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200">−</button>
                      <input type="number" min={0} step={0.1} value={line.stock_reel}
                        onChange={e => updateReel(line.stock_item_id, parseFloat(e.target.value) || 0)}
                        className="w-20 text-center font-bold text-gray-900 border border-gray-200 rounded-xl py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button onClick={() => updateReel(line.stock_item_id, line.stock_reel + 1)}
                        className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700">+</button>
                      <span className="text-xs text-gray-400 w-6">{line.unite}</span>
                    </div>
                  </div>
                  {hasEcart && (
                    <p className={`text-xs mt-1 font-medium ${ecart > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Écart : {ecart > 0 ? '+' : ''}{ecart.toFixed(1)} {line.unite}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setSession(false)} className="flex-1 py-3 border border-gray-200 rounded-2xl text-gray-600 font-medium">Annuler</button>
            <button onClick={valider} disabled={saving}
              className="flex-1 py-3 bg-green-600 text-white rounded-2xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              <CheckCircle size={16} /> {saving ? 'Validation…' : `Valider l'inventaire${ecarts.length > 0 ? ` (${ecarts.length} écarts)` : ''}`}
            </button>
          </div>
        </>
      )}

      {items.length === 0 && !session && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <ScanLine className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucun article à inventorier</p>
          <p className="text-gray-300 text-sm mt-1">Ajoutez des articles depuis les fournisseurs</p>
        </div>
      )}
    </div>
  );
}
