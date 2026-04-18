'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, AlertCircle, ShoppingCart, Package,
  TrendingUp, TrendingDown, AlertTriangle,
  Trash2, ChevronRight, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES, JOURS_SEMAINE } from '@/types';
import { VILLES_MAROC, QUARTIERS_PAR_VILLE } from '@/lib/maroc-geo';
import { formatDate, formatPrice } from '@/lib/utils';

interface OrderItem { display_name: string; quantity_ordered: number; unit_price: number }
interface OrderHistory { id: string; numero: string; delivery_date: string; status: string; total: number; items: OrderItem[] }
interface ArticleStat { display_name: string; total_qty: number; total_amount: number; order_count: number }
interface MonthStats { orders: number; amount: number }

const PERIODS = [
  { label: '30j', days: 30 },
  { label: '3 mois', days: 90 },
  { label: '6 mois', days: 180 },
  { label: '1 an', days: 365 },
  { label: 'Tout', days: 0 },
];

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg font-semibold">Nouveau</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-lg">stable</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-lg font-semibold flex items-center gap-0.5 ${up ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{pct}%
    </span>
  );
}

export default function EditClientPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'infos' | 'historique'>('infos');
  const [saved, setSaved] = useState(false);

  // History state
  const [periodDays, setPeriodDays] = useState(90);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [allOrders, setAllOrders] = useState<OrderHistory[]>([]);
  const [periodOrders, setPeriodOrders] = useState<OrderHistory[]>([]);
  const [articleStats, setArticleStats] = useState<ArticleStat[]>([]);
  const [currentMonth, setCurrentMonth] = useState<MonthStats>({ orders: 0, amount: 0 });
  const [previousMonth, setPreviousMonth] = useState<MonthStats>({ orders: 0, amount: 0 });
  const [daysSinceLastOrder, setDaysSinceLastOrder] = useState<number | null>(null);

  const [form, setForm] = useState({
    nom: '', contact_nom: '', telephone: '', email: '',
    ville: '', quartier: '', adresse_livraison: '',
    type_client: 'autre', jours_livraison: [] as string[],
    horaire_livraison: '', note_interne: '', is_active: true,
    code: '', ice: '',
  });

  const quartiersDisponibles = form.ville ? (QUARTIERS_PAR_VILLE[form.ville] || []) : [];

  useEffect(() => { loadClient(); }, [id]);
  useEffect(() => {
    if (activeTab === 'historique' && !historyLoaded) {
      loadHistory();
    }
  }, [activeTab, id]);

  async function loadClient() {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
    if (error || !data) { router.push('/clients'); return; }
    setForm({
      nom: data.nom, contact_nom: data.contact_nom || '', telephone: data.telephone || '',
      email: data.email || '', ville: data.ville || '', quartier: data.quartier || '',
      adresse_livraison: data.adresse_livraison || '', type_client: data.type_client,
      jours_livraison: data.jours_livraison || [], horaire_livraison: data.horaire_livraison || '',
      note_interne: data.note_interne || '', is_active: data.is_active,
      code: data.code || '', ice: data.ice || '',
    });
    setLoadingData(false);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

      const [ordersResult, cmResult, pmResult] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id, numero, delivery_date, status, total,
            items:order_items(
              quantity_ordered, unit_price,
              product_article:product_articles(display_name)
            )
          `)
          .eq('client_id', id)
          .not('status', 'eq', 'annulee')
          .order('delivery_date', { ascending: false })
          .limit(200),
        supabase.from('orders').select('total').eq('client_id', id).not('status', 'eq', 'annulee').gte('delivery_date', currentMonthStart),
        supabase.from('orders').select('total').eq('client_id', id).not('status', 'eq', 'annulee').gte('delivery_date', prevMonthStart).lte('delivery_date', prevMonthEnd),
      ]);

      if (ordersResult.error) throw ordersResult.error;

      setCurrentMonth({
        orders: cmResult.data?.length || 0,
        amount: (cmResult.data || []).reduce((s: number, o: any) => s + (o.total || 0), 0),
      });
      setPreviousMonth({
        orders: pmResult.data?.length || 0,
        amount: (pmResult.data || []).reduce((s: number, o: any) => s + (o.total || 0), 0),
      });

      const mapped: OrderHistory[] = (ordersResult.data || []).map((o: any) => ({
        id: o.id,
        numero: o.numero,
        delivery_date: o.delivery_date,
        status: o.status,
        total: o.total,
        items: (o.items || []).map((it: any) => ({
          display_name: it.product_article?.display_name || 'Article supprimé',
          quantity_ordered: it.quantity_ordered,
          unit_price: it.unit_price,
        })),
      }));
      setAllOrders(mapped);
      setHistoryLoaded(true);

      if (mapped.length > 0) {
        const lastDate = new Date(mapped[0].delivery_date);
        setDaysSinceLastOrder(Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));
      }
    } catch (e: any) {
      console.error('Erreur historique:', e);
    } finally {
      setLoadingHistory(false);
    }
  }

  // Filtrer les commandes par période sélectionnée
  useEffect(() => {
    if (periodDays === 0) {
      setPeriodOrders(allOrders);
    } else {
      const from = new Date();
      from.setDate(from.getDate() - periodDays);
      const fromStr = from.toISOString().split('T')[0];
      setPeriodOrders(allOrders.filter(o => o.delivery_date >= fromStr));
    }
  }, [allOrders, periodDays]);

  // Stats articles sur la période
  useEffect(() => {
    const statsMap: Record<string, ArticleStat> = {};
    for (const order of periodOrders) {
      for (const item of order.items) {
        const name = item.display_name;
        if (!statsMap[name]) statsMap[name] = { display_name: name, total_qty: 0, total_amount: 0, order_count: 0 };
        statsMap[name].total_qty += item.quantity_ordered;
        statsMap[name].total_amount += item.quantity_ordered * item.unit_price;
        statsMap[name].order_count += 1;
      }
    }
    setArticleStats(Object.values(statsMap).sort((a, b) => b.total_qty - a.total_qty));
  }, [periodOrders]);

  const toggleJour = (jour: string) => setForm(f => ({
    ...f,
    jours_livraison: f.jours_livraison.includes(jour) ? f.jours_livraison.filter(j => j !== jour) : [...f.jours_livraison, jour],
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom) return;
    setLoading(true);
    try {
      await supabase.from('clients').update({
        nom: form.nom, contact_nom: form.contact_nom || null, telephone: form.telephone || null,
        email: form.email || null, ville: form.ville || null, quartier: form.quartier || null,
        adresse_livraison: form.adresse_livraison || null, type_client: form.type_client,
        jours_livraison: form.jours_livraison, horaire_livraison: form.horaire_livraison || null,
        note_interne: form.note_interne || null, is_active: form.is_active,
        code: form.code || null, ice: form.ice || null,
      }).eq('id', id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); alert('Erreur lors de la modification'); }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await supabase.from('clients').delete().eq('id', id);
      router.push('/clients');
    } catch (e: any) { alert(`Erreur: ${e?.message}`); setLoading(false); }
  }

  if (loadingData) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  const totalPeriod = periodOrders.reduce((s, o) => s + o.total, 0);
  const inactivityRisk = daysSinceLastOrder !== null && daysSinceLastOrder >= 60;
  const inactivityDanger = daysSinceLastOrder !== null && daysSinceLastOrder >= 90;
  const lastOrder = allOrders[0] || null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/clients" className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 flex-shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 truncate">{form.nom || 'Client'}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${form.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
              {form.is_active ? 'Actif' : 'Inactif'}
            </span>
            <span className="text-xs text-gray-400">{CLIENT_TYPES.find(t => t.value === form.type_client)?.label}</span>
          </div>
        </div>
        <button onClick={() => setShowDeleteConfirm(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500">
          <Trash2 size={16} />
        </button>
      </div>

      {/* Confirmation suppression */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-semibold text-red-900 text-sm">Supprimer {form.nom} ?</p>
              <p className="text-xs text-red-700 mt-0.5">Cette action est irréversible.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">Annuler</button>
            <button onClick={handleDelete} disabled={loading} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">Supprimer</button>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
        <button onClick={() => setActiveTab('infos')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'infos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Informations
        </button>
        <button
          onClick={() => {
            if (activeTab !== 'historique') {
              if (!historyLoaded) setLoadingHistory(true);
              setActiveTab('historique');
            }
          }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'historique' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          Historique
        </button>
      </div>

      {/* ─── INFOS ─── */}
      {activeTab === 'infos' && (
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Coordonnées */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Coordonnées</p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nom / Société *</label>
              <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Contact</label>
                <input type="text" value={form.contact_nom} onChange={e => setForm(f => ({ ...f, contact_nom: e.target.value }))} placeholder="Prénom Nom"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Type</label>
                <select value={form.type_client} onChange={e => setForm(f => ({ ...f, type_client: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                  {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Téléphone</label>
                <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
          </div>

          {/* Adresse */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Adresse</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ville</label>
                <select value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value, quartier: '' }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                  <option value="">— Ville —</option>
                  {VILLES_MAROC.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Quartier</label>
                {quartiersDisponibles.length > 0 ? (
                  <select value={form.quartier} onChange={e => setForm(f => ({ ...f, quartier: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                    <option value="">— Quartier —</option>
                    {quartiersDisponibles.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.quartier} onChange={e => setForm(f => ({ ...f, quartier: e.target.value }))} disabled={!form.ville}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Adresse de livraison</label>
              <textarea value={form.adresse_livraison} onChange={e => setForm(f => ({ ...f, adresse_livraison: e.target.value }))} rows={2} placeholder="Rue, numéro…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" />
            </div>
          </div>

          {/* Facturation */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Facturation</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Code client</label>
                <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="CLT-0001"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">I.C.E</label>
                <input type="text" value={form.ice} onChange={e => setForm(f => ({ ...f, ice: e.target.value }))}
                  placeholder="000000000000000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
          </div>

          {/* Livraison */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Livraison</p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">Jours habituels</label>
              <div className="flex flex-wrap gap-2">
                {JOURS_SEMAINE.map(jour => (
                  <button key={jour.value} type="button" onClick={() => toggleJour(jour.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${form.jours_livraison.includes(jour.value) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {jour.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Horaire</label>
              <input type={form.type_client === 'particulier' ? 'time' : 'text'} value={form.horaire_livraison}
                onChange={e => setForm(f => ({ ...f, horaire_livraison: e.target.value }))} placeholder="Ex: 07:00-09:00"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
          </div>

          {/* Note + statut */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Note interne</label>
              <textarea value={form.note_interne} onChange={e => setForm(f => ({ ...f, note_interne: e.target.value }))} rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`w-12 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-7' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">{form.is_active ? 'Client actif' : 'Client inactif'}</span>
            </label>
          </div>

          {/* Bouton save */}
          <button type="submit" disabled={loading || !form.nom}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white active:bg-blue-700'}`}>
            <Save size={18} />
            {saved ? 'Enregistré ✓' : loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      {/* ─── HISTORIQUE ─── */}
      {activeTab === 'historique' && (
        <div className="space-y-4">

          {/* Alerte inactivité */}
          {inactivityDanger && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 font-medium">Inactif depuis {daysSinceLastOrder} jours</p>
            </div>
          )}
          {inactivityRisk && !inactivityDanger && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-orange-800 font-medium">Sans commande depuis {daysSinceLastOrder} jours</p>
            </div>
          )}

          {/* Mois en cours */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Ce mois</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">{currentMonth.orders}</span>
                <TrendBadge current={currentMonth.orders} previous={previousMonth.orders} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(currentMonth.amount)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">Mois précédent</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-500">{previousMonth.orders}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{formatPrice(previousMonth.amount)}</p>
            </div>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : allOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <ShoppingCart className="text-gray-300 mx-auto mb-3" size={36} />
              <p className="text-gray-500 font-medium">Aucune commande</p>
              <div className="flex items-center justify-center gap-4 mt-3">
                <Link href={`/commandes/nouvelle`} className="inline-flex items-center gap-1.5 text-blue-600 text-sm font-semibold">
                  Créer une commande →
                </Link>
                <button
                  onClick={() => { setHistoryLoaded(false); loadHistory(); }}
                  className="inline-flex items-center gap-1.5 text-gray-400 text-sm"
                >
                  <RefreshCw size={14} /> Actualiser
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Chips période */}
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {PERIODS.map(p => (
                  <button key={p.days} onClick={() => setPeriodDays(p.days)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${periodDays === p.days ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Stats période */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                  <p className="text-xl font-black text-gray-900">{periodOrders.length}</p>
                  <p className="text-xs text-gray-400">commandes</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                  <p className="text-sm font-black text-gray-900 leading-tight">{formatPrice(totalPeriod)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">CA période</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                  <p className="text-sm font-black text-gray-900 leading-tight">{periodOrders.length > 0 ? formatPrice(totalPeriod / periodOrders.length) : '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">panier moy.</p>
                </div>
              </div>

              {/* Articles achetés */}
              {articleStats.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50">
                    <p className="font-semibold text-gray-900 text-sm">Articles achetés</p>
                    <p className="text-xs text-gray-400 mt-0.5">Classés par volume sur la période</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {articleStats.map((stat, i) => {
                      const pct = Math.round((stat.total_qty / articleStats[0].total_qty) * 100);
                      return (
                        <div key={i} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">{stat.display_name}</span>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                              <span className="text-xs text-gray-400">{stat.order_count} cmd</span>
                              <span className="text-sm font-black text-gray-900 w-8 text-right">×{stat.total_qty}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dernière commande */}
              {lastOrder && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <p className="font-semibold text-gray-900 text-sm">Dernière commande</p>
                    {daysSinceLastOrder !== null && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${daysSinceLastOrder >= 90 ? 'bg-red-100 text-red-700' : daysSinceLastOrder >= 60 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                        il y a {daysSinceLastOrder}j
                      </span>
                    )}
                  </div>
                  <Link href={`/commandes/${lastOrder.id}`} className="flex items-center justify-between px-4 py-3 active:bg-gray-50">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{lastOrder.numero}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(lastOrder.delivery_date)}</p>
                      <div className="mt-1.5 space-y-0.5">
                        {lastOrder.items.slice(0, 3).map((item, i) => (
                          <p key={i} className="text-xs text-gray-500">×{item.quantity_ordered} {item.display_name}</p>
                        ))}
                        {lastOrder.items.length > 3 && <p className="text-xs text-gray-400">+{lastOrder.items.length - 3} autres</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-bold text-gray-900">{formatPrice(lastOrder.total)}</span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </Link>
                </div>
              )}

              {/* Liste commandes */}
              {periodOrders.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <p className="font-semibold text-gray-900 text-sm">Commandes ({periodOrders.length})</p>
                    <button
                      onClick={() => { setHistoryLoaded(false); loadHistory(); }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {periodOrders.map(order => (
                      <Link key={order.id} href={`/commandes/${order.id}`} className="flex items-start justify-between px-4 py-3 active:bg-gray-50 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-800 text-sm">{order.numero}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              order.status === 'livree' ? 'bg-green-100 text-green-700' :
                              order.status === 'confirmee' ? 'bg-blue-100 text-blue-700' :
                              order.status === 'production' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {order.status === 'livree' ? 'Livrée' :
                               order.status === 'confirmee' ? 'Conf.' :
                               order.status === 'production' ? 'Prod.' : order.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.delivery_date)}</p>
                          {order.items.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {order.items.slice(0, 2).map(it => `×${it.quantity_ordered} ${it.display_name}`).join(' · ')}
                              {order.items.length > 2 && ` +${order.items.length - 2}`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                          <span className="font-bold text-gray-900 text-sm">{formatPrice(order.total)}</span>
                          <ChevronRight size={14} className="text-gray-300" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
