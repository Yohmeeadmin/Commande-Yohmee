'use client';

import { useEffect, useState, useMemo } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAteliers } from '@/lib/useAteliers';

interface Movement {
  id: string;
  stock_item_id: string;
  type: string;
  quantite: number;
  prix_unitaire: number | null;
  date: string;
  note: string | null; // atelier pour sortie_economat
  stock_item?: { nom: string; unite: string };
}

interface InvoiceLine {
  stock_item_id: string;
  quantite: number;
  prix_unitaire: number;
  date_facture: string;
  stock_item?: { nom: string };
  supplier?: { nom: string };
}

const PERIODS = [
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
  { label: '3 mois', days: 90 },
  { label: '12 mois', days: 365 },
];

export default function AnalysesPage() {
  const { ateliers } = useAteliers();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [activeTab, setActiveTab] = useState<'sorties' | 'prix' | 'valeur'>('sorties');

  useEffect(() => { load(); }, [period]);

  async function load() {
    const since = new Date();
    since.setDate(since.getDate() - period);
    const sinceStr = since.toISOString().slice(0, 10);

    const [{ data: mvts }, { data: lines }] = await Promise.all([
      supabase.from('stock_movements').select('*, stock_item:stock_items(nom, unite)').gte('date', sinceStr).order('date', { ascending: false }),
      supabase.from('supplier_invoice_lines').select('*, stock_item:stock_items(nom), invoice:supplier_invoices!inner(date_facture, statut, supplier:suppliers(nom))')
        .eq('invoice.statut', 'validee').gte('invoice.date_facture', sinceStr),
    ]);
    setMovements((mvts as Movement[]) || []);
    setInvoiceLines((lines || []).map((l: any) => ({ ...l, date_facture: l.invoice?.date_facture, supplier: l.invoice?.supplier })));
    setLoading(false);
  }

  // Sorties par atelier
  const sortiesParAtelier = useMemo(() => {
    const economat = movements.filter(m => m.type === 'sortie_economat');
    const byAtelier: Record<string, { articles: Record<string, number> }> = {};
    for (const m of economat) {
      const atelier = m.note || 'Inconnu';
      if (!byAtelier[atelier]) byAtelier[atelier] = { articles: {} };
      const nom = m.stock_item?.nom || m.stock_item_id;
      byAtelier[atelier].articles[nom] = (byAtelier[atelier].articles[nom] || 0) + Math.abs(m.quantite);
    }
    return Object.entries(byAtelier).map(([atelier, data]) => ({
      atelier,
      articles: Object.entries(data.articles).sort((a, b) => b[1] - a[1]),
      total: Object.values(data.articles).reduce((s, v) => s + v, 0),
    })).sort((a, b) => b.total - a.total);
  }, [movements]);

  // Evolution prix par article (depuis factures)
  const prixParArticle = useMemo(() => {
    const byArticle: Record<string, { nom: string; prices: { date: string; prix: number; supplier: string }[] }> = {};
    for (const l of invoiceLines) {
      const nom = l.stock_item?.nom || l.stock_item_id;
      if (!byArticle[l.stock_item_id]) byArticle[l.stock_item_id] = { nom, prices: [] };
      byArticle[l.stock_item_id].prices.push({ date: l.date_facture, prix: l.prix_unitaire, supplier: l.supplier?.nom || '—' });
    }
    return Object.entries(byArticle).map(([id, data]) => {
      const sorted = data.prices.sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0]?.prix || 0;
      const last = sorted[sorted.length - 1]?.prix || 0;
      const variation = first > 0 ? ((last - first) / first) * 100 : 0;
      return { id, nom: data.nom, prices: sorted, first, last, variation };
    }).sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation));
  }, [invoiceLines]);

  // Valeur du stock
  const [stockItems, setStockItems] = useState<{ nom: string; stock_actuel: number; prix_moyen_pondere: number; unite: string }[]>([]);
  useEffect(() => {
    supabase.from('stock_items').select('nom, stock_actuel, prix_moyen_pondere, unite').order('nom')
      .then(({ data }: { data: { nom: string; stock_actuel: number; prix_moyen_pondere: number; unite: string }[] | null }) => setStockItems(data || []));
  }, []);
  const valeurTotale = stockItems.reduce((s, i) => s + i.stock_actuel * i.prix_moyen_pondere, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">Analyses</h1>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${period === p.days ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
        {[{ k: 'sorties', l: 'Sorties par atelier' }, { k: 'prix', l: 'Évolution prix' }, { k: 'valeur', l: 'Valeur stock' }].map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k as any)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${activeTab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <>
          {/* Sorties par atelier */}
          {activeTab === 'sorties' && (
            <div className="space-y-3">
              {sortiesParAtelier.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                  <BarChart2 className="text-gray-200 mx-auto mb-3" size={36} />
                  <p className="text-gray-400 font-medium">Aucune sortie sur la période</p>
                </div>
              ) : sortiesParAtelier.map(a => (
                <div key={a.atelier} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-gray-900">{a.atelier}</p>
                    <p className="text-sm text-blue-600 font-semibold">{a.articles.length} article{a.articles.length > 1 ? 's' : ''}</p>
                  </div>
                  <div className="space-y-1.5">
                    {a.articles.map(([nom, qty]) => {
                      const maxQty = a.articles[0][1];
                      const pct = maxQty > 0 ? (qty / maxQty) * 100 : 0;
                      return (
                        <div key={nom} className="flex items-center gap-3">
                          <p className="text-sm text-gray-700 w-32 truncate flex-shrink-0">{nom}</p>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-sm font-semibold text-gray-900 w-12 text-right flex-shrink-0">{qty.toFixed(1)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Évolution prix */}
          {activeTab === 'prix' && (
            <div className="space-y-2">
              {prixParArticle.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                  <TrendingUp className="text-gray-200 mx-auto mb-3" size={36} />
                  <p className="text-gray-400 font-medium">Aucune facture validée sur la période</p>
                </div>
              ) : prixParArticle.map(a => (
                <div key={a.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{a.nom}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {a.prices.map((p, i) => (
                          <span key={i} className="text-xs text-gray-400">{new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : <strong className="text-gray-700">{p.prix.toFixed(2)}</strong> MAD <span className="text-gray-300">({p.supplier})</span></span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {a.variation > 0 ? (
                        <span className="flex items-center gap-1 text-sm font-bold text-red-600"><TrendingUp size={14} />+{a.variation.toFixed(1)}%</span>
                      ) : a.variation < 0 ? (
                        <span className="flex items-center gap-1 text-sm font-bold text-green-600"><TrendingDown size={14} />{a.variation.toFixed(1)}%</span>
                      ) : (
                        <span className="flex items-center gap-1 text-sm font-bold text-gray-400"><Minus size={14} />stable</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Valeur stock */}
          {activeTab === 'valeur' && (
            <div className="space-y-3">
              <div className="bg-blue-600 text-white rounded-2xl px-5 py-4">
                <p className="text-sm font-medium opacity-80">Valeur totale du stock MP</p>
                <p className="text-3xl font-black mt-1">{valeurTotale.toFixed(2)} MAD</p>
              </div>
              <div className="space-y-2">
                {stockItems.filter(i => i.prix_moyen_pondere > 0).sort((a, b) => (b.stock_actuel * b.prix_moyen_pondere) - (a.stock_actuel * a.prix_moyen_pondere)).map(item => {
                  const val = item.stock_actuel * item.prix_moyen_pondere;
                  const pct = valeurTotale > 0 ? (val / valeurTotale) * 100 : 0;
                  return (
                    <div key={item.nom} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-semibold text-gray-900">{item.nom}</p>
                        <p className="text-sm font-bold text-gray-900">{val.toFixed(2)} MAD</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 shrink-0">{item.stock_actuel} {item.unite} × {item.prix_moyen_pondere.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
