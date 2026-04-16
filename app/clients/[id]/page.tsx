'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, ShoppingCart, Package, Calendar, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES, JOURS_SEMAINE } from '@/types';
import { VILLES_MAROC, QUARTIERS_PAR_VILLE } from '@/lib/maroc-geo';
import { formatDate, formatPrice } from '@/lib/utils';

interface OrderItem {
  display_name: string;
  quantity_ordered: number;
  unit_price: number;
}

interface OrderHistory {
  id: string;
  numero: string;
  delivery_date: string;
  status: string;
  total: number;
  items: OrderItem[];
}

interface ArticleStat {
  display_name: string;
  total_qty: number;
  total_amount: number;
  order_count: number;
}

interface MonthStats {
  orders: number;
  amount: number;
}

const PERIODS = [
  { label: '7 derniers jours', days: 7 },
  { label: '30 derniers jours', days: 30 },
  { label: '3 derniers mois', days: 90 },
  { label: '6 derniers mois', days: 180 },
  { label: '1 an', days: 365 },
  { label: 'Tout', days: 0 },
];

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
        <TrendingUp size={12} />
        <span>Nouveau</span>
      </div>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
        <Minus size={12} />
        <span>=</span>
      </div>
    );
  }
  const up = pct > 0;
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${up ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      <span>{up ? '+' : ''}{pct}% vs mois préc.</span>
    </div>
  );
}

export default function EditClientPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'infos' | 'historique'>('infos');

  // History state
  const [periodDays, setPeriodDays] = useState(30);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [lastOrder, setLastOrder] = useState<OrderHistory | null>(null);
  const [articleStats, setArticleStats] = useState<ArticleStat[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [currentMonth, setCurrentMonth] = useState<MonthStats>({ orders: 0, amount: 0 });
  const [previousMonth, setPreviousMonth] = useState<MonthStats>({ orders: 0, amount: 0 });
  const [daysSinceLastOrder, setDaysSinceLastOrder] = useState<number | null>(null);

  const [form, setForm] = useState({
    nom: '',
    contact_nom: '',
    telephone: '',
    email: '',
    ville: '',
    quartier: '',
    adresse_livraison: '',
    type_client: 'autre',
    jours_livraison: [] as string[],
    horaire_livraison: '',
    note_interne: '',
    is_active: true,
  });

  const quartiersDisponibles = form.ville ? (QUARTIERS_PAR_VILLE[form.ville] || []) : [];

  useEffect(() => {
    loadClient();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'historique') {
      loadHistory();
    }
  }, [activeTab, periodDays, id]);

  async function loadClient() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        router.push('/clients');
        router.refresh();
        return;
      }

      setForm({
        nom: data.nom,
        contact_nom: data.contact_nom || '',
        telephone: data.telephone || '',
        email: data.email || '',
        ville: data.ville || '',
        quartier: data.quartier || '',
        adresse_livraison: data.adresse_livraison || '',
        type_client: data.type_client,
        jours_livraison: data.jours_livraison || [],
        horaire_livraison: data.horaire_livraison || '',
        note_interne: data.note_interne || '',
        is_active: data.is_active,
      });
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoadingData(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

      let query = supabase
        .from('orders')
        .select(`
          id, numero, delivery_date, status, total,
          items:order_items(
            quantity_ordered, unit_price,
            product_article:product_articles!product_article_id(display_name)
          )
        `)
        .eq('client_id', id)
        .not('status', 'eq', 'annulee')
        .order('delivery_date', { ascending: false });

      if (periodDays > 0) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - periodDays);
        query = query.gte('delivery_date', fromDate.toISOString().split('T')[0]);
      }

      const [{ data: orders }, { data: currentMonthOrders }, { data: prevMonthOrders }] = await Promise.all([
        query,
        supabase
          .from('orders')
          .select('total')
          .eq('client_id', id)
          .not('status', 'eq', 'annulee')
          .gte('delivery_date', currentMonthStart),
        supabase
          .from('orders')
          .select('total')
          .eq('client_id', id)
          .not('status', 'eq', 'annulee')
          .gte('delivery_date', prevMonthStart)
          .lte('delivery_date', prevMonthEnd),
      ]);

      // Month stats
      setCurrentMonth({
        orders: currentMonthOrders?.length || 0,
        amount: (currentMonthOrders || []).reduce((s: number, o: { total: number }) => s + (o.total || 0), 0),
      });
      setPreviousMonth({
        orders: prevMonthOrders?.length || 0,
        amount: (prevMonthOrders || []).reduce((s: number, o: { total: number }) => s + (o.total || 0), 0),
      });

      if (!orders) return;

      // Dernière commande + jours d'inactivité
      if (orders.length > 0) {
        const first = orders[0];
        setLastOrder({
          id: first.id,
          numero: first.numero,
          delivery_date: first.delivery_date,
          status: first.status,
          total: first.total,
          items: (first.items || []).map((it: any) => ({
            display_name: it.product_article?.display_name || '?',
            quantity_ordered: it.quantity_ordered,
            unit_price: it.unit_price,
          })),
        });
        const lastDate = new Date(first.delivery_date);
        const diffMs = now.getTime() - lastDate.getTime();
        setDaysSinceLastOrder(Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      } else {
        setLastOrder(null);
        setDaysSinceLastOrder(null);
      }

      // Stats articles
      const statsMap: Record<string, ArticleStat> = {};
      let totalAmt = 0;
      for (const order of orders) {
        totalAmt += order.total || 0;
        for (const item of (order.items || [])) {
          const name = item.product_article?.display_name || '?';
          if (!statsMap[name]) {
            statsMap[name] = { display_name: name, total_qty: 0, total_amount: 0, order_count: 0 };
          }
          statsMap[name].total_qty += item.quantity_ordered;
          statsMap[name].total_amount += item.quantity_ordered * item.unit_price;
          statsMap[name].order_count += 1;
        }
      }

      setArticleStats(Object.values(statsMap).sort((a, b) => b.total_qty - a.total_qty));
      setTotalOrders(orders.length);
      setTotalAmount(totalAmt);
    } catch (error) {
      console.error('Erreur historique:', error);
    } finally {
      setLoadingHistory(false);
    }
  }

  const toggleJour = (jour: string) => {
    setForm({
      ...form,
      jours_livraison: form.jours_livraison.includes(jour)
        ? form.jours_livraison.filter(j => j !== jour)
        : [...form.jours_livraison, jour],
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          nom: form.nom,
          contact_nom: form.contact_nom || null,
          telephone: form.telephone || null,
          email: form.email || null,
          ville: form.ville || null,
          quartier: form.quartier || null,
          adresse_livraison: form.adresse_livraison || null,
          type_client: form.type_client,
          jours_livraison: form.jours_livraison,
          horaire_livraison: form.horaire_livraison || null,
          note_interne: form.note_interne || null,
          is_active: form.is_active,
        })
        .eq('id', id);

      if (error) throw error;
      router.push('/clients');
      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la modification du client');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      router.push('/clients');
      router.refresh();
    } catch (error: any) {
      console.error('Erreur:', error);
      alert(`Erreur: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const inactivityRisk = daysSinceLastOrder !== null && daysSinceLastOrder >= 60;
  const inactivityDanger = daysSinceLastOrder !== null && daysSinceLastOrder >= 90;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clients" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{form.nom || 'Client'}</h1>
            <p className="text-gray-500 mt-1">Fiche client</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors"
        >
          Supprimer
        </button>
      </div>

      {/* Confirmation suppression */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-600 mt-0.5 shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-medium text-red-900">Supprimer ce client ?</p>
            <p className="text-sm text-red-700 mt-1">Cette action est irréversible.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-white rounded-xl transition-colors">
              Annuler
            </button>
            <button onClick={handleDelete} disabled={loading} className="px-4 py-2 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50">
              Supprimer
            </button>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('infos')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'infos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Informations
        </button>
        <button
          onClick={() => setActiveTab('historique')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'historique' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Historique & Articles
        </button>
      </div>

      {/* Onglet Informations */}
      {activeTab === 'infos' && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Nom / Société *</label>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nom du contact</label>
              <input
                type="text"
                value={form.contact_nom}
                onChange={(e) => setForm({ ...form, contact_nom: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type de client</label>
              <select
                value={form.type_client}
                onChange={(e) => setForm({ ...form, type_client: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {CLIENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
              <input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ville</label>
              <select
                value={form.ville}
                onChange={(e) => setForm({ ...form, ville: e.target.value, quartier: '' })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">— Choisir une ville —</option>
                {VILLES_MAROC.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quartier</label>
              {quartiersDisponibles.length > 0 ? (
                <select
                  value={form.quartier}
                  onChange={(e) => setForm({ ...form, quartier: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">— Choisir un quartier —</option>
                  {quartiersDisponibles.map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.quartier}
                  onChange={(e) => setForm({ ...form, quartier: e.target.value })}
                  placeholder={form.ville ? 'Saisir le quartier...' : 'Choisir une ville d\'abord'}
                  disabled={!form.ville}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Adresse de livraison</label>
              <textarea
                value={form.adresse_livraison}
                onChange={(e) => setForm({ ...form, adresse_livraison: e.target.value })}
                rows={2}
                placeholder="Rue, numéro, complément d'adresse..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Jours habituels de livraison</label>
              <div className="flex flex-wrap gap-2">
                {JOURS_SEMAINE.map((jour) => (
                  <button
                    key={jour.value}
                    type="button"
                    onClick={() => toggleJour(jour.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      form.jours_livraison.includes(jour.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {jour.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {form.type_client === 'particulier' ? 'Heure de livraison' : 'Horaire de livraison habituel'}
              </label>
              {form.type_client === 'particulier' ? (
                <input
                  type="time"
                  value={form.horaire_livraison}
                  onChange={(e) => setForm({ ...form, horaire_livraison: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              ) : (
                <input
                  type="text"
                  value={form.horaire_livraison}
                  onChange={(e) => setForm({ ...form, horaire_livraison: e.target.value })}
                  placeholder="Ex: 07:00-09:00"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Note interne</label>
            <textarea
              value={form.note_interne}
              onChange={(e) => setForm({ ...form, note_interne: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
              <div>
                <span className="font-medium text-gray-700">Client actif</span>
                <p className="text-sm text-gray-500">Peut recevoir des commandes</p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <Link href="/clients" className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors">
              Annuler
            </Link>
            <button
              type="submit"
              disabled={loading || !form.nom}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save size={20} />
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {/* Onglet Historique */}
      {activeTab === 'historique' && (
        <div className="space-y-5">
          {/* Sélecteur de période */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-sm font-medium text-gray-500 mb-3">Période</p>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setPeriodDays(p.days)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    periodDays === p.days
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* Alerte inactivité */}
              {inactivityDanger && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">Client passé en inactif automatiquement</p>
                    <p className="text-sm text-red-700 mt-0.5">Aucune commande depuis {daysSinceLastOrder} jours (seuil : 90 jours).</p>
                  </div>
                </div>
              )}
              {inactivityRisk && !inactivityDanger && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle size={20} className="text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-orange-900">Client à risque</p>
                    <p className="text-sm text-orange-700 mt-0.5">Aucune commande depuis {daysSinceLastOrder} jours. Passage en inactif dans {90 - daysSinceLastOrder!} jours.</p>
                  </div>
                </div>
              )}

              {/* Comparaison mois en cours vs mois précédent */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wide">Mois en cours vs mois précédent</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Commandes</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-900">{currentMonth.orders}</span>
                      <TrendBadge current={currentMonth.orders} previous={previousMonth.orders} label="commandes" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">vs {previousMonth.orders} le mois dernier</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Chiffre d'affaires</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl font-bold text-gray-900">{formatPrice(currentMonth.amount)}</span>
                      <TrendBadge current={currentMonth.amount} previous={previousMonth.amount} label="CA" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">vs {formatPrice(previousMonth.amount)} le mois dernier</p>
                  </div>
                </div>
              </div>

              {/* KPIs période sélectionnée */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                    <ShoppingCart size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
                    <p className="text-xs text-gray-500">commandes</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                    <TrendingUp size={20} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{formatPrice(totalAmount)}</p>
                    <p className="text-xs text-gray-500">chiffre d'affaires</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                    <Package size={20} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{totalOrders > 0 ? formatPrice(totalAmount / totalOrders) : '—'}</p>
                    <p className="text-xs text-gray-500">panier moyen</p>
                  </div>
                </div>
              </div>

              {/* Dernière commande */}
              {lastOrder ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Calendar size={16} className="text-gray-400" />
                      Dernière commande
                      {daysSinceLastOrder !== null && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-normal ${
                          daysSinceLastOrder >= 90 ? 'bg-red-100 text-red-700' :
                          daysSinceLastOrder >= 60 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          il y a {daysSinceLastOrder}j
                        </span>
                      )}
                    </h3>
                    <Link
                      href={`/commandes/${lastOrder.id}`}
                      className="text-sm text-blue-600 hover:underline font-medium"
                    >
                      {lastOrder.numero}
                    </Link>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{formatDate(lastOrder.delivery_date)}</p>
                  <div className="space-y-2">
                    {lastOrder.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{item.display_name}</span>
                        <span className="font-medium text-gray-900">× {item.quantity_ordered}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                    <span className="text-gray-500">Total</span>
                    <span className="font-bold text-gray-900">{formatPrice(lastOrder.total)}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
                  Aucune commande sur cette période
                </div>
              )}

              {/* Articles achetés */}
              {articleStats.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Package size={16} className="text-gray-400" />
                    <h3 className="font-semibold text-gray-900">Articles achetés</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {articleStats.map((stat, i) => {
                      const maxQty = articleStats[0].total_qty;
                      const pct = Math.round((stat.total_qty / maxQty) * 100);
                      return (
                        <div key={i} className="px-5 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-800">{stat.display_name}</span>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-500">{stat.order_count} cmd{stat.order_count > 1 ? 's' : ''}</span>
                              <span className="font-semibold text-gray-900 w-10 text-right">{stat.total_qty}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
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
      )}
    </div>
  );
}
