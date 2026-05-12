'use client';

import { useEffect, useState } from 'react';
import { Plus, CheckCircle, X, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useAteliers } from '@/lib/useAteliers';

interface StockItem { id: string; nom: string; unite: string; stock_actuel: number; }
interface EconomatLine { id?: string; stock_item_id: string; quantite_demandee: number; quantite_servie: number | null; stock_item?: StockItem; }
interface EconomatRequest {
  id: string; atelier: string; demandeur: string; date: string;
  statut: 'en_attente' | 'valide' | 'refuse'; note: string | null;
  lines?: EconomatLine[];
}

const STATUT_STYLES = {
  en_attente: { label: 'En attente', bg: 'bg-orange-100', color: 'text-orange-700' },
  valide:     { label: 'Validé',     bg: 'bg-green-100',  color: 'text-green-700' },
  refuse:     { label: 'Refusé',     bg: 'bg-red-100',    color: 'text-red-600' },
};

export default function EconomatPage() {
  const { profile } = useUser();
  const { ateliers } = useAteliers();
  const [requests, setRequests] = useState<EconomatRequest[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('en_attente');

  // Formulaire
  const [fAtelier, setFAtelier] = useState('');
  const [fNote, setFNote] = useState('');
  const [fLines, setFLines] = useState<{ stock_item_id: string; quantite_demandee: number }[]>([]);

  // Validation
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [servieQty, setServieQty] = useState<Record<string, number>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: req }, { data: itm }] = await Promise.all([
      supabase.from('economat_requests').select('*, lines:economat_lines(*, stock_item:stock_items(nom, unite, stock_actuel))').order('date', { ascending: false }),
      supabase.from('stock_items').select('id, nom, unite, stock_actuel').order('nom'),
    ]);
    setRequests((req as EconomatRequest[]) || []);
    setItems(itm || []);
    setLoading(false);
  }

  function addLine() { setFLines(p => [...p, { stock_item_id: '', quantite_demandee: 1 }]); }
  function updateLine(idx: number, k: string, v: any) { setFLines(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l)); }
  function removeLine(idx: number) { setFLines(p => p.filter((_, i) => i !== idx)); }

  async function saveDemande() {
    if (!fAtelier || !fLines.length || fLines.some(l => !l.stock_item_id)) return;
    setSaving(true);
    const { data: req } = await supabase.from('economat_requests').insert({
      atelier: fAtelier,
      demandeur: profile ? `${profile.first_name} ${profile.last_name}` : 'Inconnu',
      date: new Date().toISOString().slice(0, 10),
      statut: 'en_attente',
      note: fNote || null,
    }).select().single();

    if (req) {
      await supabase.from('economat_lines').insert(fLines.map(l => ({ ...l, request_id: req.id })));
      setShowForm(false); setFAtelier(''); setFNote(''); setFLines([]);
      load();
    }
    setSaving(false);
  }

  async function valider(req: EconomatRequest) {
    setSaving(true);
    // Mettre à jour les quantités servies
    for (const line of req.lines || []) {
      const qty = servieQty[line.id!] ?? line.quantite_demandee;
      await supabase.from('economat_lines').update({ quantite_servie: qty }).eq('id', line.id!);
      // Déduire du stock
      const { data: item } = await supabase.from('stock_items').select('stock_actuel').eq('id', line.stock_item_id).single();
      if (item) {
        await supabase.from('stock_items').update({ stock_actuel: Math.max(0, item.stock_actuel - qty) }).eq('id', line.stock_item_id);
      }
      // Journal
      await supabase.from('stock_movements').insert({ stock_item_id: line.stock_item_id, type: 'sortie_economat', quantite: -qty, reference_id: req.id, reference_type: 'economat_request', date: req.date, note: req.atelier });
    }
    await supabase.from('economat_requests').update({ statut: 'valide' }).eq('id', req.id);
    setValidatingId(null); setServieQty({}); load(); setSaving(false);
  }

  async function refuser(id: string) {
    await supabase.from('economat_requests').update({ statut: 'refuse' }).eq('id', id);
    setRequests(p => p.map(r => r.id === id ? { ...r, statut: 'refuse' } : r));
  }

  const displayed = filterStatut === 'all' ? requests : requests.filter(r => r.statut === filterStatut);
  const enAttente = requests.filter(r => r.statut === 'en_attente').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bons d'économat</h1>
          {enAttente > 0 && <p className="text-sm text-orange-600 font-medium">{enAttente} en attente de validation</p>}
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
          <Plus size={15} /> Nouvelle demande
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">Nouvelle demande</p>
            <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
          </div>
          <select value={fAtelier} onChange={e => setFAtelier(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Atelier *</option>
            {ateliers.map(a => <option key={a.id} value={a.label}>{a.label}</option>)}
          </select>
          <textarea value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Note (optionnel)" rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Articles demandés</p>
            {fLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select value={line.stock_item_id} onChange={e => updateLine(idx, 'stock_item_id', e.target.value)}
                  className="sm:col-span-8 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                  <option value="">— Article</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.nom} ({i.unite}) — stock: {i.stock_actuel}</option>)}
                </select>
                <input type="number" min={1} value={line.quantite_demandee} onChange={e => updateLine(idx, 'quantite_demandee', parseFloat(e.target.value) || 1)}
                  className="sm:col-span-3 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none" />
                <button onClick={() => removeLine(idx)} className="sm:col-span-1 flex justify-center text-red-400"><X size={14} /></button>
              </div>
            ))}
            <button onClick={addLine} className="w-full py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center gap-1.5">
              <Plus size={12} /> Ajouter un article
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
            <button onClick={saveDemande} disabled={saving || !fAtelier || !fLines.length}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
              {saving ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </div>
        </div>
      )}

      {/* Filtre statut */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {[{ v: 'en_attente', l: `En attente${enAttente > 0 ? ` (${enAttente})` : ''}` }, { v: 'valide', l: 'Validés' }, { v: 'refuse', l: 'Refusés' }, { v: 'all', l: 'Tous' }].map(f => (
          <button key={f.v} onClick={() => setFilterStatut(f.v)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${filterStatut === f.v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading && requests.length === 0 ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <ClipboardList className="text-gray-200 mx-auto mb-3" size={40} />
          <p className="text-gray-400 font-medium">Aucune demande</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(req => {
            const st = STATUT_STYLES[req.statut];
            const open = expandedId === req.id;
            const validating = validatingId === req.id;
            return (
              <div key={req.id} className={`bg-white rounded-2xl border overflow-hidden ${req.statut === 'en_attente' ? 'border-orange-200' : 'border-gray-100'}`}>
                <div className="flex items-start gap-3 px-4 py-3">
                  <button onClick={() => setExpandedId(open ? null : req.id)} className="flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{req.atelier}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${st.bg} ${st.color}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(req.date).toLocaleDateString('fr-FR')} · {req.demandeur} · {req.lines?.length || 0} article{(req.lines?.length || 0) > 1 ? 's' : ''}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {req.statut === 'en_attente' && (
                      <>
                        <button onClick={() => { setValidatingId(req.id); setExpandedId(req.id); const s: Record<string, number> = {}; req.lines?.forEach(l => { if (l.id) s[l.id] = l.quantite_demandee; }); setServieQty(s); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold">
                          <CheckCircle size={12} /> Valider
                        </button>
                        <button onClick={() => refuser(req.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><X size={14} /></button>
                      </>
                    )}
                    {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-50 px-4 pb-3 pt-2 space-y-2">
                    {req.note && <p className="text-xs text-gray-500 italic">"{req.note}"</p>}
                    <div className="space-y-1">
                      {(req.lines || []).map((line, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                          <p className="text-sm text-gray-800 flex-1">{line.stock_item?.nom} <span className="text-gray-400">({line.stock_item?.unite})</span></p>
                          {validating && line.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Demandé: {line.quantite_demandee}</span>
                              <span className="text-xs text-gray-400">→ Servi:</span>
                              <input type="number" min={0} max={line.quantite_demandee} value={servieQty[line.id] ?? line.quantite_demandee}
                                onChange={e => setServieQty(p => ({ ...p, [line.id!]: parseFloat(e.target.value) || 0 }))}
                                className="w-20 sm:w-16 px-2 py-2 sm:py-1 border border-blue-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                          ) : (
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">×{line.quantite_demandee}</p>
                              {line.quantite_servie !== null && line.quantite_servie !== line.quantite_demandee && (
                                <p className="text-xs text-orange-600">Servi: {line.quantite_servie}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {validating && (
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => setValidatingId(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
                        <button onClick={() => valider(req)} disabled={saving} className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                          {saving ? 'Validation…' : 'Confirmer & déduire stock'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
