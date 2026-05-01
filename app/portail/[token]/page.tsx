'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Search, X, Plus, Minus, ChevronLeft, CheckCircle, AlertCircle,
  Package, Clock, FileText, Save, Globe, RefreshCw, Trash2, Pause,
  Play, Star, Settings, Home, ChevronDown, Calendar,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalClient {
  id: string; nom: string; raison_sociale: string | null;
  telephone: string | null; email: string | null;
  adresse_livraison: string | null; ville: string | null; type_client: string;
}
interface PortalSettings { company_name: string; logo_url: string | null; portal_order_deadline: string; }
interface Category { id: string; name: string; }
interface DeliverySlot { id: string; name: string; start_time: string; end_time: string; }
interface Article {
  id: string; display_name: string; quantity: number;
  prix_particulier: number | null; prix_pro: number | null; custom_price: number | null;
  portal_client_ids: string[] | null;
  product_reference: { id: string; name: string; base_unit_price: number; vat_rate: number; category: { id: string; name: string } | null; } | null;
}
interface CartLine {
  article_id: string; display_name: string; unit_price: number; unit_quantity: number; quantity: number;
}
interface HistoryOrder {
  id: string; numero: string; delivery_date: string; status: string; total: number;
  source: string; has_bl: boolean;
  delivery_slot: { name: string; start_time: string; end_time: string } | null;
  items: { product_article_id: string | null; quantity_ordered: number; unit_price: number; product_article: { display_name: string } | null }[];
}
interface PortalRecurrence {
  id: string; nom: string | null; days_of_week: string[];
  delivery_slot_id: string | null;
  delivery_slot: { id: string; name: string; start_time: string; end_time: string } | null;
  items: { article_id: string; display_name: string; quantity: number; unit_price: number }[];
  is_active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcPrice(article: Article, typeClient: string, clientPrices: Record<string, number>): number {
  if (clientPrices[article.id] !== undefined) return clientPrices[article.id];
  if (typeClient === 'particulier' && article.prix_particulier !== null) return article.prix_particulier;
  if (typeClient === 'entreprise' && article.prix_pro !== null) return article.prix_pro;
  if (article.custom_price !== null) return article.custom_price;
  return (article.product_reference?.base_unit_price ?? 0) * article.quantity;
}
function formatPrice(n: number) { return n.toFixed(2).replace('.', ',') + ' MAD'; }
function nextDays(n: number): string[] {
  const days: string[] = []; const d = new Date(); d.setDate(d.getDate() + 1);
  for (let i = 0; i < n; i++) { days.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
  return days;
}
function formatDay(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function formatDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  brouillon:  { label: 'En attente',   color: '#6B7280', bg: '#F3F4F6' },
  confirmee:  { label: 'Confirmée',    color: '#2563EB', bg: '#DBEAFE' },
  production: { label: 'En cours',     color: '#D97706', bg: '#FEF3C7' },
  livree:     { label: 'Livrée',       color: '#059669', bg: '#D1FAE5' },
  annulee:    { label: 'Annulée',      color: '#DC2626', bg: '#FEE2E2' },
};
const JOURS = [
  { value: 'lundi', label: 'Lun' }, { value: 'mardi', label: 'Mar' },
  { value: 'mercredi', label: 'Mer' }, { value: 'jeudi', label: 'Jeu' },
  { value: 'vendredi', label: 'Ven' }, { value: 'samedi', label: 'Sam' },
  { value: 'dimanche', label: 'Dim' },
];

type View = 'accueil' | 'produits' | 'commandes' | 'validation' | 'profil' | 'success' | 'recurrences' | 'recurrence-new';

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortailPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<PortalClient | null>(null);
  const [settings, setSettings] = useState<PortalSettings | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [clientType, setClientType] = useState('entreprise');
  const [clientPrices, setClientPrices] = useState<Record<string, number>>({});

  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [view, setView] = useState<View>('accueil');

  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySlotId, setDeliverySlotId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ numero: string; pending: boolean } | null>(null);
  const [expandNote, setExpandNote] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [homeInitialized, setHomeInitialized] = useState(false);

  const [profil, setProfil] = useState({ telephone: '', email: '', adresse_livraison: '', ville: '' });
  const [profilSaving, setProfilSaving] = useState(false);
  const [profilSaved, setProfilSaved] = useState(false);

  const [recurrences, setRecurrences] = useState<PortalRecurrence[]>([]);
  const [recurrencesLoaded, setRecurrencesLoaded] = useState(false);
  const [recurrencesLoading, setRecurrencesLoading] = useState(false);
  const [newRecDays, setNewRecDays] = useState<string[]>([]);
  const [newRecSlotId, setNewRecSlotId] = useState('');
  const [newRecNom, setNewRecNom] = useState('');
  const [newRecItems, setNewRecItems] = useState<{ article_id: string; display_name: string; quantity: number; unit_price: number }[]>([]);
  const [newRecSearch, setNewRecSearch] = useState('');
  const [newRecSaving, setNewRecSaving] = useState(false);

  const [manualFavorites, setManualFavorites] = useState<string[]>([]);

  // bfcache
  useEffect(() => {
    const h = (e: PageTransitionEvent) => { if (e.persisted) setView('accueil'); };
    window.addEventListener('pageshow', h);
    return () => window.removeEventListener('pageshow', h);
  }, []);

  // favorites from localStorage
  useEffect(() => {
    try { const s = localStorage.getItem(`fav_${token}`); if (s) setManualFavorites(JSON.parse(s)); } catch {}
  }, [token]);

  // init
  useEffect(() => {
    async function init() {
      try {
        const [clientRes, catRes] = await Promise.all([
          fetch(`/api/portail/${token}`),
          fetch(`/api/portail/${token}/catalogue`),
        ]);
        if (!clientRes.ok) { const { error: e } = await clientRes.json(); setError(e || 'Lien invalide'); return; }
        const { client: c, settings: s } = await clientRes.json();
        setClient(c); setSettings(s);
        setProfil({ telephone: c.telephone || '', email: c.email || '', adresse_livraison: c.adresse_livraison || '', ville: c.ville || '' });
        if (catRes.ok) {
          const { articles: a, categories: cats, slots: sl, clientType: ct, clientPrices: cp } = await catRes.json();
          setArticles(a || []); setCategories(cats || []); setSlots(sl || []);
          setClientType(ct || 'entreprise'); setClientPrices(cp || {});
        }
      } catch { setError('Erreur de connexion'); }
      finally { setLoading(false); }
    }
    init();
  }, [token]);

  // load history
  async function loadHistory() {
    if (historyLoaded) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/portail/${token}/historique`);
      if (res.ok) { const { orders } = await res.json(); setHistory(orders || []); setHistoryLoaded(true); }
    } finally { setHistoryLoading(false); }
  }
  useEffect(() => {
    if (['accueil', 'commandes', 'profil'].includes(view)) loadHistory();
  }, [view]);

  // pre-load last order on home
  useEffect(() => {
    if (view === 'accueil' && historyLoaded && history.length > 0 && !homeInitialized && articles.length > 0 && cart.length === 0) {
      const last = history[0];
      const lines: CartLine[] = [];
      for (const item of last.items) {
        if (!item.product_article_id) continue;
        const a = articles.find(x => x.id === item.product_article_id);
        if (!a) continue;
        lines.push({ article_id: a.id, display_name: a.display_name, unit_price: calcPrice(a, clientType, clientPrices), unit_quantity: a.quantity, quantity: item.quantity_ordered });
      }
      if (lines.length > 0) setCart(lines);
      setHomeInitialized(true);
    }
  }, [view, historyLoaded, history, articles, homeInitialized, clientType, clientPrices]);

  // recurrences
  async function loadRecurrences() {
    if (recurrencesLoaded) return;
    setRecurrencesLoading(true);
    try {
      const res = await fetch(`/api/portail/${token}/recurrences`);
      if (res.ok) { const { recurrences: r } = await res.json(); setRecurrences(r || []); setRecurrencesLoaded(true); }
    } finally { setRecurrencesLoading(false); }
  }
  useEffect(() => { if (view === 'recurrences' || view === 'accueil') loadRecurrences(); }, [view]);

  async function toggleRecurrence(rec: PortalRecurrence) {
    const res = await fetch(`/api/portail/${token}/recurrences/${rec.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !rec.is_active }) });
    if (res.ok) setRecurrences(prev => prev.map(r => r.id === rec.id ? { ...r, is_active: !r.is_active } : r));
  }
  async function deleteRecurrence(rec: PortalRecurrence) {
    if (!confirm(`Supprimer "${rec.nom || 'cette récurrence'}" ?`)) return;
    const res = await fetch(`/api/portail/${token}/recurrences/${rec.id}`, { method: 'DELETE' });
    if (res.ok) setRecurrences(prev => prev.filter(r => r.id !== rec.id));
  }
  async function handleCreateRecurrence() {
    if (!newRecDays.length || !newRecItems.length) return;
    setNewRecSaving(true);
    try {
      const res = await fetch(`/api/portail/${token}/recurrences`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: newRecNom || null, days_of_week: newRecDays, delivery_slot_id: newRecSlotId || null, items: newRecItems }) });
      if (!res.ok) { const { error: e } = await res.json(); alert(e || 'Erreur'); return; }
      const { recurrence } = await res.json();
      const slotInfo = slots.find(s => s.id === newRecSlotId) ?? null;
      setRecurrences(prev => [{ ...recurrence, delivery_slot: slotInfo ? { id: slotInfo.id, name: slotInfo.name, start_time: slotInfo.start_time, end_time: slotInfo.end_time } : null }, ...prev]);
      setNewRecDays([]); setNewRecSlotId(''); setNewRecNom(''); setNewRecItems([]); setNewRecSearch('');
      setView('recurrences');
    } finally { setNewRecSaving(false); }
  }

  // cart
  const setQty = useCallback((article: Article, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(l => l.article_id !== article.id)); return; }
    const price = calcPrice(article, clientType, clientPrices);
    setCart(prev => {
      const ex = prev.find(l => l.article_id === article.id);
      if (ex) return prev.map(l => l.article_id === article.id ? { ...l, quantity: qty } : l);
      return [...prev, { article_id: article.id, display_name: article.display_name, unit_price: price, unit_quantity: article.quantity, quantity: qty }];
    });
  }, [clientType, clientPrices]);

  const getQty = (id: string) => cart.find(l => l.article_id === id)?.quantity ?? 0;
  const cartTotal = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);

  // favorites
  const autoFavorites = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of history)
      for (const item of order.items)
        if (item.product_article_id)
          counts[item.product_article_id] = (counts[item.product_article_id] || 0) + item.quantity_ordered;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  }, [history]);

  const favoriteIds = useMemo(() => Array.from(new Set([...autoFavorites, ...manualFavorites])), [autoFavorites, manualFavorites]);

  function toggleFavorite(articleId: string) {
    setManualFavorites(prev => {
      const next = prev.includes(articleId) ? prev.filter(id => id !== articleId) : [...prev, articleId];
      try { localStorage.setItem(`fav_${token}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // recommander
  function handleRecommander(order: HistoryOrder) {
    const lines: CartLine[] = [];
    for (const item of order.items) {
      if (!item.product_article_id) continue;
      const a = articles.find(x => x.id === item.product_article_id);
      if (!a) continue;
      lines.push({ article_id: a.id, display_name: a.display_name, unit_price: calcPrice(a, clientType, clientPrices), unit_quantity: a.quantity, quantity: item.quantity_ordered });
    }
    if (!lines.length) return;
    setCart(lines); setView('validation');
  }

  // submit
  async function handleSubmit() {
    if (!deliveryDate || !cart.length) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portail/${token}/commandes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.map(l => ({ article_id: l.article_id, quantity: l.quantity, unit_price: l.unit_price, unit_quantity: l.unit_quantity })), delivery_date: deliveryDate, delivery_slot_id: deliverySlotId || null, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccessInfo({ numero: data.numero, pending: data.pending_validation });
      setCart([]); setHistoryLoaded(false); setHomeInitialized(false);
      setNote(''); setDeliveryDate(''); setDeliverySlotId(''); setExpandNote(false); setShowDatePicker(false);
      setView('success');
    } catch (err: any) { alert(err.message || 'Erreur'); }
    finally { setSubmitting(false); }
  }

  async function handleSaveProfil() {
    setProfilSaving(true);
    try {
      const res = await fetch(`/api/portail/${token}/profil`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profil) });
      if (res.ok) { setProfilSaved(true); setTimeout(() => setProfilSaved(false), 2500); }
    } finally { setProfilSaving(false); }
  }

  // loading / error
  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  if (error) return <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 p-6"><AlertCircle size={48} className="text-red-400" /><p className="text-gray-700 font-semibold text-lg text-center">{error}</p></div>;

  // dates
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const futureDays = nextDays(14);

  // nav
  const activeNav: View | null = ['validation', 'success'].includes(view) ? null
    : ['recurrences', 'recurrence-new', 'profil'].includes(view) ? 'commandes' : view as View;

  const BottomNav = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex max-w-lg mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {([
        { key: 'accueil' as View, icon: Home, label: 'Accueil' },
        { key: 'produits' as View, icon: Package, label: 'Produits' },
        { key: 'commandes' as View, icon: Clock, label: 'Commandes' },
      ]).map(({ key, icon: Icon, label }) => (
        <button key={key} onClick={() => setView(key)}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${activeNav === key ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className="relative">
            <Icon size={20} />
            {key === 'accueil' && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white font-bold w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: 9 }}>{cartCount > 9 ? '9+' : cartCount}</span>
            )}
          </div>
          <span className="text-xs font-medium">{label}</span>
        </button>
      ))}
    </div>
  );

  const FloatingCart = () => cartCount === 0 ? null : (
    <div className="fixed left-0 right-0 max-w-lg mx-auto px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)' }}>
      <button onClick={() => setView('validation')}
        className="w-full flex items-center justify-between px-5 py-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all">
        <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-xl">{cartCount}</span>
        <span className="font-bold text-base">Commander</span>
        <span className="font-bold">{formatPrice(cartTotal)}</span>
      </button>
    </div>
  );

  // filtered for produits
  const filteredArticles = articles.filter(a => {
    if (selectedCat && a.product_reference?.category?.id !== selectedCat) return false;
    if (search && !a.display_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const favArticles = filteredArticles.filter(a => favoriteIds.includes(a.id));
  const otherArticles = filteredArticles.filter(a => !favoriteIds.includes(a.id));

  // ── success ───────────────────────────────────────────────────────────────
  if (view === 'success' && successInfo) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 max-w-lg mx-auto">
      <div className="bg-white rounded-3xl p-8 w-full text-center space-y-5 shadow-sm">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-2xl">C'est commandé !</p>
          <p className="text-gray-400 text-sm mt-1">Réf. {successInfo.numero}</p>
        </div>
        {successInfo.pending
          ? <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><p className="text-amber-700 text-sm font-semibold">En attente de validation</p><p className="text-amber-600 text-xs mt-1">Reçue après l'heure limite.</p></div>
          : <div className="bg-green-50 border border-green-200 rounded-2xl p-4"><p className="text-green-700 text-sm font-semibold">Commande confirmée ✓</p></div>
        }
        <button onClick={() => setView('accueil')} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base hover:bg-blue-700">Retour à l'accueil</button>
      </div>
    </div>
  );

  // ── validation ────────────────────────────────────────────────────────────
  if (view === 'validation') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setView('accueil')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <p className="font-bold text-gray-900">Finaliser la commande</p>
          <p className="text-xs text-gray-400">{cartCount} article{cartCount > 1 ? 's' : ''} · {formatPrice(cartTotal)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-40">
        {/* Récap articles */}
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {cart.map(line => {
            const article = articles.find(a => a.id === line.article_id);
            return (
              <div key={line.article_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{line.display_name}</p>
                  <p className="text-xs text-gray-400">{formatPrice(line.unit_price)} / unité</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => article && setQty(article, line.quantity - 1)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200"><Minus size={13} /></button>
                  <span className="w-6 text-center font-bold text-sm">{line.quantity}</span>
                  <button onClick={() => article && setQty(article, line.quantity + 1)} className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200"><Plus size={13} /></button>
                </div>
                <p className="text-sm font-bold text-gray-900 w-20 text-right">{formatPrice(line.quantity * line.unit_price)}</p>
              </div>
            );
          })}
        </div>

        {/* Date */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Date de livraison *</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Aujourd'hui", value: todayStr },
              { label: 'Demain', value: tomorrowStr },
            ].map(({ label, value }) => (
              <button key={value} onClick={() => { setDeliveryDate(value); setShowDatePicker(false); }}
                className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${deliveryDate === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                {label}
              </button>
            ))}
            <button onClick={() => setShowDatePicker(p => !p)}
              className={`py-3 rounded-xl text-sm font-semibold border transition-colors flex items-center justify-center gap-1.5 ${showDatePicker || (deliveryDate && deliveryDate !== todayStr && deliveryDate !== tomorrowStr) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
              <Calendar size={14} /> Choisir
            </button>
          </div>
          {deliveryDate && deliveryDate !== todayStr && deliveryDate !== tomorrowStr && !showDatePicker && (
            <p className="text-sm text-blue-600 font-semibold text-center">{formatDay(deliveryDate)}</p>
          )}
          {showDatePicker && (
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pt-1">
              {futureDays.slice(2).map(d => (
                <button key={d} onClick={() => { setDeliveryDate(d); setShowDatePicker(false); }}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border text-left transition-colors ${deliveryDate === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                  {formatDay(d)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Créneau */}
        {slots.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Créneau</p>
            <div className="grid grid-cols-2 gap-2">
              {slots.map(s => (
                <button key={s.id} onClick={() => setDeliverySlotId(p => p === s.id ? '' : s.id)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${deliverySlotId === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                  {s.name} · {s.start_time.slice(0, 5)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note accordéon */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <button onClick={() => setExpandNote(p => !p)} className="w-full flex items-center justify-between px-4 py-3.5">
            <span className="text-sm font-medium text-gray-500">{note ? 'Note ajoutée ✓' : 'Ajouter une note'}</span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandNote ? 'rotate-180' : ''}`} />
          </button>
          {expandNote && (
            <div className="px-4 pb-4">
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Instructions de livraison…" rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
        </div>
      </div>

      {/* Confirm sticky */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 p-4 space-y-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
        <div className="flex items-center justify-between px-1">
          <span className="text-gray-500">Total</span>
          <span className="text-2xl font-bold text-gray-900">{formatPrice(cartTotal)}</span>
        </div>
        <button onClick={handleSubmit} disabled={!deliveryDate || submitting}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
          {submitting ? 'Envoi en cours…' : 'Confirmer la commande'}
        </button>
        {!deliveryDate && <p className="text-xs text-center text-amber-600">Choisissez une date de livraison</p>}
      </div>
    </div>
  );

  // ── profil ────────────────────────────────────────────────────────────────
  if (view === 'profil') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setView('commandes')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><ChevronLeft size={20} /></button>
        <p className="font-bold text-gray-900">Mon profil</p>
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          {[
            { key: 'telephone', label: 'Téléphone', type: 'tel', placeholder: '06 XX XX XX XX' },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'contact@exemple.com' },
            { key: 'adresse_livraison', label: 'Adresse de livraison', type: 'text', placeholder: '123 rue...' },
            { key: 'ville', label: 'Ville', type: 'text', placeholder: 'Casablanca' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
              <input type={type} value={(profil as any)[key]} onChange={e => setProfil(p => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base" />
            </div>
          ))}
        </div>
        <button onClick={handleSaveProfil} disabled={profilSaving}
          className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${profilSaved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {profilSaved ? <><CheckCircle size={18} /> Enregistré</> : <><Save size={18} /> Enregistrer</>}
        </button>
        <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-2">
          <Globe size={14} className="text-gray-400" />
          <p className="text-xs text-gray-400">Modifications visibles par votre fournisseur.</p>
        </div>
      </div>
      <BottomNav />
    </div>
  );

  // ── récurrences ───────────────────────────────────────────────────────────
  if (view === 'recurrences') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('commandes')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><ChevronLeft size={20} /></button>
          <p className="font-bold text-gray-900">Récurrences</p>
        </div>
        <button onClick={() => setView('recurrence-new')} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
          <Plus size={15} /> Nouvelle
        </button>
      </div>
      <div className="flex-1 p-4 space-y-3">
        {recurrencesLoading ? <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          : recurrences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <RefreshCw size={32} className="text-gray-200" />
              <p className="text-gray-400 text-sm text-center">Aucune commande récurrente</p>
              <button onClick={() => setView('recurrence-new')} className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold"><Plus size={15} /> Créer</button>
            </div>
          ) : recurrences.map(rec => {
            const daysLabel = rec.days_of_week.map(d => JOURS.find(j => j.value === d)?.label ?? d).join(', ');
            return (
              <div key={rec.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${rec.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold text-gray-900 text-sm">{rec.nom || 'Récurrence'}</p><p className="text-xs text-gray-400">{daysLabel}</p></div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleRecurrence(rec)} className={`p-1.5 rounded-lg ${rec.is_active ? 'text-orange-500 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}>{rec.is_active ? <Pause size={15} /> : <Play size={15} />}</button>
                    <button onClick={() => deleteRecurrence(rec)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rec.items.map((item, i) => <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{item.quantity}× {item.display_name}</span>)}
                </div>
              </div>
            );
          })}
      </div>
      <BottomNav />
    </div>
  );

  // ── nouvelle récurrence ───────────────────────────────────────────────────
  if (view === 'recurrence-new') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setView('recurrences')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"><ChevronLeft size={20} /></button>
        <p className="font-bold text-gray-900">Nouvelle récurrence</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Libellé (optionnel)</p>
          <input type="text" value={newRecNom} onChange={e => setNewRecNom(e.target.value)} placeholder="Ex: Pains quotidiens…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Jours de livraison *</p>
          <div className="grid grid-cols-7 gap-1.5">
            {JOURS.map(j => (
              <button key={j.value} type="button" onClick={() => setNewRecDays(prev => prev.includes(j.value) ? prev.filter(d => d !== j.value) : [...prev, j.value])}
                className={`py-2 rounded-xl text-xs font-semibold transition-colors ${newRecDays.includes(j.value) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {j.label}
              </button>
            ))}
          </div>
        </div>
        {slots.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Créneau</p>
            {slots.map(s => (
              <button key={s.id} type="button" onClick={() => setNewRecSlotId(p => p === s.id ? '' : s.id)}
                className={`w-full px-4 py-3 rounded-xl text-sm font-medium border text-left transition-colors ${newRecSlotId === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>
                {s.name} · {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
              </button>
            ))}
          </div>
        )}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Articles *</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={newRecSearch} onChange={e => setNewRecSearch(e.target.value)} placeholder="Rechercher…"
              className="w-full pl-8 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
          </div>
          {newRecSearch && (
            <div className="border border-gray-100 rounded-xl divide-y max-h-40 overflow-y-auto">
              {articles.filter(a => a.display_name.toLowerCase().includes(newRecSearch.toLowerCase())).slice(0, 12).map(a => {
                if (newRecItems.find(i => i.article_id === a.id)) return null;
                return (
                  <button key={a.id} type="button" onClick={() => { setNewRecItems(prev => [...prev, { article_id: a.id, display_name: a.display_name, quantity: 1, unit_price: calcPrice(a, clientType, clientPrices) }]); setNewRecSearch(''); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 text-left">
                    <span className="text-sm text-gray-800">{a.display_name}</span>
                    <Plus size={15} className="text-blue-600" />
                  </button>
                );
              })}
            </div>
          )}
          {newRecItems.map(item => (
            <div key={item.article_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <p className="flex-1 text-sm font-medium text-gray-800 truncate">{item.display_name}</p>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setNewRecItems(prev => item.quantity <= 1 ? prev.filter(i => i.article_id !== item.article_id) : prev.map(i => i.article_id === item.article_id ? { ...i, quantity: i.quantity - 1 } : i))}
                  className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-sm">
                  {item.quantity <= 1 ? <Trash2 size={12} className="text-red-400" /> : '−'}
                </button>
                <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                <button type="button" onClick={() => setNewRecItems(prev => prev.map(i => i.article_id === item.article_id ? { ...i, quantity: i.quantity + 1 } : i))}
                  className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-sm">+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border-t border-gray-100 p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
        <button onClick={handleCreateRecurrence} disabled={newRecSaving || !newRecDays.length || !newRecItems.length}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
          <RefreshCw size={18} /> {newRecSaving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      <BottomNav />
    </div>
  );

  // ── commandes ─────────────────────────────────────────────────────────────
  if (view === 'commandes') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="font-bold text-gray-900">Mes commandes</p>
          <p className="text-xs text-gray-400 mt-0.5">{client?.nom}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setView('recurrences')} className="p-2.5 text-gray-400 hover:bg-gray-100 rounded-xl" title="Récurrences"><RefreshCw size={18} /></button>
          <button onClick={() => setView('profil')} className="p-2.5 text-gray-400 hover:bg-gray-100 rounded-xl" title="Profil"><Settings size={18} /></button>
        </div>
      </div>
      <div className="flex-1 p-4 space-y-3">
        {historyLoading ? <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Clock size={40} className="text-gray-200" />
              <p className="text-gray-400 text-sm">Aucune commande passée</p>
            </div>
          ) : history.map(order => {
            const st = STATUS_LABELS[order.status] ?? STATUS_LABELS.brouillon;
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{formatDate(order.delivery_date)}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{order.numero}{order.delivery_slot ? ` · ${order.delivery_slot.name}` : ''}</p>
                  </div>
                  <p className="font-bold text-gray-900 text-sm shrink-0">{formatPrice(order.total)}</p>
                </div>
                <div className="px-4 pb-2 space-y-0.5">
                  {order.items.map((item, i) => <p key={i} className="text-xs text-gray-500">{item.product_article?.display_name ?? '—'} <span className="font-semibold text-gray-700">×{item.quantity_ordered}</span></p>)}
                </div>
                <div className={`border-t border-gray-50 px-4 py-2.5 flex items-center ${order.has_bl ? 'justify-between' : 'justify-end'}`}>
                  {order.has_bl && <div className="flex items-center gap-1.5"><FileText size={13} className="text-green-600" /><span className="text-xs text-green-700 font-medium">BL disponible</span></div>}
                  <button onClick={() => handleRecommander(order)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-100">
                    <RefreshCw size={11} /> Recommander
                  </button>
                </div>
              </div>
            );
          })}
      </div>
      <BottomNav />
    </div>
  );

  // ── accueil ───────────────────────────────────────────────────────────────
  if (view === 'accueil') {
    const preloading = historyLoaded && history.length > 0 && !homeInitialized && articles.length > 0;
    const isFirstTime = historyLoaded && history.length === 0;
    const showSpinner = historyLoading || preloading;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-40">
        {/* Header */}
        <div className="bg-white px-4 pt-6 pb-4">
          {settings?.logo_url && <img src={settings.logo_url} alt="logo" className="h-8 object-contain mb-3" />}
          <p className="text-2xl font-bold text-gray-900">Bonjour {client?.nom?.split(' ')[0]} 👋</p>
          <p className="text-sm text-gray-400 mt-0.5 capitalize">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        <div className="flex-1 p-4 space-y-5">
          {showSpinner && !cart.length && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          )}

          {isFirstTime && !cart.length && (
            <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center space-y-4">
              <div className="text-5xl">🛍️</div>
              <div>
                <p className="font-bold text-gray-900 text-lg">Bienvenue !</p>
                <p className="text-gray-400 text-sm mt-1">Découvrez notre catalogue et passez votre première commande.</p>
              </div>
              <button onClick={() => setView('produits')} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700">
                Voir le catalogue →
              </button>
            </div>
          )}

          {/* Commande en cours */}
          {cart.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  {historyLoaded && history.length > 0 ? 'Commande habituelle' : 'Ma commande'}
                </p>
                <button onClick={() => setView('produits')} className="text-xs text-blue-600 font-semibold hover:text-blue-700">+ Ajouter un article</button>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {cart.map((line, idx) => {
                  const article = articles.find(a => a.id === line.article_id);
                  return (
                    <div key={line.article_id} className={`flex items-center gap-4 px-4 py-4 ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{line.display_name}</p>
                        <p className="text-sm font-bold text-blue-600 mt-0.5">{formatPrice(line.unit_price)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => article && setQty(article, line.quantity - 1)}
                          className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all">
                          <Minus size={16} />
                        </button>
                        <span className="w-8 text-center font-bold text-gray-900 text-lg">{line.quantity}</span>
                        <button onClick={() => article && setQty(article, line.quantity + 1)}
                          className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all">
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commandes récurrentes */}
          {recurrences.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">Commandes récurrentes</p>
              {recurrences.map(rec => (
                <div key={rec.id} className={`bg-white rounded-2xl border overflow-hidden ${rec.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${rec.is_active ? 'bg-green-50' : 'bg-gray-100'}`}>
                      <RefreshCw size={14} className={rec.is_active ? 'text-green-600' : 'text-gray-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{rec.nom || 'Récurrence'}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {rec.days_of_week?.length === 7 ? 'Tous les jours' : rec.days_of_week?.map((d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}
                        {' · '}{rec.items?.length || 0} art.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleRecurrence(rec)}
                        className={`p-2 rounded-xl ${rec.is_active ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-600'}`}
                      >
                        {rec.is_active ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button
                        onClick={() => deleteRecurrence(rec)}
                        className="p-2 rounded-xl bg-red-50 text-red-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Dernières commandes */}
          {historyLoaded && history.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">Historique récent</p>
              {history.slice(0, 3).map(order => {
                const st = STATUS_LABELS[order.status] ?? STATUS_LABELS.brouillon;
                return (
                  <div key={order.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{formatDate(order.delivery_date)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                        <span className="text-xs text-gray-400">{order.items.length} art.</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="font-bold text-gray-900 text-sm">{formatPrice(order.total)}</p>
                      <button onClick={() => handleRecommander(order)}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-100 whitespace-nowrap">
                        ↩ Reprendre
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bouton commander fixe */}
        {cart.length > 0 && (
          <div className="fixed left-0 right-0 max-w-lg mx-auto px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)' }}>
            <button onClick={() => setView('validation')}
              className="w-full flex items-center justify-between px-6 py-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/25 hover:bg-blue-700 active:scale-95 transition-all">
              <span className="bg-blue-500 px-2.5 py-1 rounded-xl text-sm font-bold">{cartCount}</span>
              <span className="font-bold text-lg">Commander</span>
              <span className="font-bold">{formatPrice(cartTotal)}</span>
            </button>
          </div>
        )}

        <BottomNav />
      </div>
    );
  }

  // ── produits (default) ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-40">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-900 text-lg">Catalogue</p>
          {settings?.logo_url && <img src={settings.logo_url} alt="logo" className="h-6 object-contain" />}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…"
            className="w-full pl-9 pr-9 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>}
        </div>
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            <button onClick={() => setSelectedCat('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!selectedCat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Tous
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setSelectedCat(p => p === c.id ? '' : c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCat === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {favArticles.length > 0 && !search && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Star size={13} className="text-amber-500 fill-amber-500" />
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Favoris</p>
            </div>
            <div className="space-y-2">
              {favArticles.map(a => <ArticleCard key={a.id} article={a} qty={getQty(a.id)} clientType={clientType} clientPrices={clientPrices} onQtyChange={setQty} isManualFav={manualFavorites.includes(a.id)} onToggleFav={toggleFavorite} />)}
            </div>
          </section>
        )}
        {otherArticles.length > 0 && (
          <section>
            {favArticles.length > 0 && !search && <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Catalogue</p>}
            <div className="space-y-2">
              {otherArticles.map(a => <ArticleCard key={a.id} article={a} qty={getQty(a.id)} clientType={clientType} clientPrices={clientPrices} onQtyChange={setQty} isManualFav={false} onToggleFav={toggleFavorite} />)}
            </div>
          </section>
        )}
        {filteredArticles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package size={40} className="text-gray-200" />
            <p className="text-gray-400 text-sm">Aucun article trouvé</p>
          </div>
        )}
      </div>

      <FloatingCart />
      <BottomNav />
    </div>
  );
}

// ─── ArticleCard ──────────────────────────────────────────────────────────────

function ArticleCard({ article, qty, clientType, clientPrices, onQtyChange, isManualFav, onToggleFav }: {
  article: Article; qty: number; clientType: string; clientPrices: Record<string, number>;
  onQtyChange: (article: Article, qty: number) => void;
  isManualFav: boolean; onToggleFav: (id: string) => void;
}) {
  const price = calcPrice(article, clientType, clientPrices);
  return (
    <div className={`bg-white rounded-2xl border p-4 flex items-center gap-3 transition-all ${qty > 0 ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-gray-900 leading-snug truncate flex-1">{article.display_name}</p>
          <button onClick={() => onToggleFav(article.id)} className="shrink-0 p-0.5 -mr-1">
            <Star size={14} className={isManualFav ? 'text-amber-500 fill-amber-500' : 'text-gray-200 hover:text-amber-300'} />
          </button>
        </div>
        <p className="text-sm font-bold text-blue-600 mt-0.5">{formatPrice(price)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {qty > 0 ? (
          <>
            <button onClick={() => onQtyChange(article, qty - 1)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all"><Minus size={15} /></button>
            <span className="w-7 text-center font-bold text-gray-900 text-base">{qty}</span>
            <button onClick={() => onQtyChange(article, qty + 1)} className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all"><Plus size={15} /></button>
          </>
        ) : (
          <button onClick={() => onQtyChange(article, 1)} className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all"><Plus size={15} /></button>
        )}
      </div>
    </div>
  );
}
