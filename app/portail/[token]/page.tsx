'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ShoppingCart, Search, X, Plus, Minus, ChevronLeft,
  CheckCircle, AlertCircle, Package, Clock, User, FileText,
  Save, Globe, RefreshCw, Trash2, Pause, Play,
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
  const days: string[] = [];
  const d = new Date(); d.setDate(d.getDate() + 1);
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

// ─── Component ────────────────────────────────────────────────────────────────

type View = 'catalogue' | 'cart' | 'historique' | 'profil' | 'success' | 'recurrences' | 'recurrence-new';

const JOURS = [
  { value: 'lundi', label: 'Lun' },
  { value: 'mardi', label: 'Mar' },
  { value: 'mercredi', label: 'Mer' },
  { value: 'jeudi', label: 'Jeu' },
  { value: 'vendredi', label: 'Ven' },
  { value: 'samedi', label: 'Sam' },
  { value: 'dimanche', label: 'Dim' },
];

interface PortalRecurrence {
  id: string;
  nom: string | null;
  days_of_week: string[];
  delivery_slot_id: string | null;
  delivery_slot: { id: string; name: string; start_time: string; end_time: string } | null;
  items: { article_id: string; display_name: string; quantity: number; unit_price: number }[];
  is_active: boolean;
}

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
  const [view, setView] = useState<View>('catalogue');

  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySlotId, setDeliverySlotId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ numero: string; pending: boolean } | null>(null);

  // Historique
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Profil
  const [profil, setProfil] = useState({ telephone: '', email: '', adresse_livraison: '', ville: '' });
  const [profilSaving, setProfilSaving] = useState(false);
  const [profilSaved, setProfilSaved] = useState(false);

  // Récurrences
  const [recurrences, setRecurrences] = useState<PortalRecurrence[]>([]);
  const [recurrencesLoaded, setRecurrencesLoaded] = useState(false);
  const [recurrencesLoading, setRecurrencesLoading] = useState(false);
  // New recurrence form
  const [newRecDays, setNewRecDays] = useState<string[]>([]);
  const [newRecSlotId, setNewRecSlotId] = useState('');
  const [newRecNom, setNewRecNom] = useState('');
  const [newRecItems, setNewRecItems] = useState<{ article_id: string; display_name: string; quantity: number; unit_price: number }[]>([]);
  const [newRecSearch, setNewRecSearch] = useState('');
  const [newRecSaving, setNewRecSaving] = useState(false);

  // ── Reset view on bfcache restore (iOS Safari) ───────────────────────────

  useEffect(() => {
    const handler = (e: PageTransitionEvent) => {
      if (e.persisted) setView('catalogue');
    };
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const [clientRes, catRes] = await Promise.all([
          fetch(`/api/portail/${token}`),
          fetch(`/api/portail/${token}/catalogue`),
        ]);
        if (!clientRes.ok) { const { error: e } = await clientRes.json(); setError(e || 'Lien invalide'); return; }
        const { client: c, settings: s } = await clientRes.json();
        setClient(c);
        setSettings(s);
        setProfil({ telephone: c.telephone || '', email: c.email || '', adresse_livraison: c.adresse_livraison || '', ville: c.ville || '' });
        if (catRes.ok) {
          const catData = await catRes.json();
          console.log('[DEBUG catalogue]', catData._debug);
          const { articles: a, categories: cats, slots: sl, clientType: ct, clientPrices: cp } = catData;
          setArticles(a || []); setCategories(cats || []); setSlots(sl || []);
          setClientType(ct || 'entreprise'); setClientPrices(cp || {});
        }
      } catch { setError('Erreur de connexion'); }
      finally { setLoading(false); }
    }
    init();
  }, [token]);

  async function loadHistory() {
    if (historyLoaded) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/portail/${token}/historique`);
      if (res.ok) { const { orders } = await res.json(); setHistory(orders || []); setHistoryLoaded(true); }
    } finally { setHistoryLoading(false); }
  }

  useEffect(() => { if (view === 'historique' || view === 'profil') loadHistory(); }, [view]);

  async function loadRecurrences() {
    if (recurrencesLoaded) return;
    setRecurrencesLoading(true);
    try {
      const res = await fetch(`/api/portail/${token}/recurrences`);
      if (res.ok) { const { recurrences: r } = await res.json(); setRecurrences(r || []); setRecurrencesLoaded(true); }
    } finally { setRecurrencesLoading(false); }
  }

  useEffect(() => { if (view === 'recurrences') loadRecurrences(); }, [view]);

  async function toggleRecurrence(rec: PortalRecurrence) {
    const res = await fetch(`/api/portail/${token}/recurrences/${rec.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rec.is_active }),
    });
    if (res.ok) setRecurrences(prev => prev.map(r => r.id === rec.id ? { ...r, is_active: !r.is_active } : r));
  }

  async function deleteRecurrence(rec: PortalRecurrence) {
    if (!confirm(`Supprimer la récurrence "${rec.nom || 'sans nom'}" ?`)) return;
    const res = await fetch(`/api/portail/${token}/recurrences/${rec.id}`, { method: 'DELETE' });
    if (res.ok) setRecurrences(prev => prev.filter(r => r.id !== rec.id));
  }

  async function handleCreateRecurrence() {
    if (!newRecDays.length || !newRecItems.length) return;
    setNewRecSaving(true);
    try {
      const res = await fetch(`/api/portail/${token}/recurrences`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: newRecNom || null, days_of_week: newRecDays, delivery_slot_id: newRecSlotId || null, items: newRecItems }),
      });
      if (!res.ok) { const { error: e } = await res.json(); alert(e || 'Erreur'); return; }
      const { recurrence } = await res.json();
      // Re-fetch slot info
      const slotInfo = slots.find(s => s.id === newRecSlotId) ?? null;
      setRecurrences(prev => [{ ...recurrence, delivery_slot: slotInfo ? { id: slotInfo.id, name: slotInfo.name, start_time: slotInfo.start_time, end_time: slotInfo.end_time } : null }, ...prev]);
      setNewRecDays([]); setNewRecSlotId(''); setNewRecNom(''); setNewRecItems([]); setNewRecSearch('');
      setView('recurrences');
    } finally { setNewRecSaving(false); }
  }

  // ── Cart ──────────────────────────────────────────────────────────────────

  const setQty = useCallback((article: Article, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(l => l.article_id !== article.id)); return; }
    const price = calcPrice(article, clientType, clientPrices);
    setCart(prev => {
      const existing = prev.find(l => l.article_id === article.id);
      if (existing) return prev.map(l => l.article_id === article.id ? { ...l, quantity: qty } : l);
      return [...prev, { article_id: article.id, display_name: article.display_name, unit_price: price, unit_quantity: article.quantity, quantity: qty }];
    });
  }, [clientType, clientPrices]);

  const getQty = (articleId: string) => cart.find(l => l.article_id === articleId)?.quantity ?? 0;
  const cartTotal = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!deliveryDate || cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portail/${token}/commandes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(l => ({ article_id: l.article_id, quantity: l.quantity, unit_price: l.unit_price, unit_quantity: l.unit_quantity })),
          delivery_date: deliveryDate, delivery_slot_id: deliverySlotId || null, note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccessInfo({ numero: data.numero, pending: data.pending_validation });
      setCart([]); setHistoryLoaded(false); setView('success');
    } catch (err: any) { alert(err.message || 'Erreur lors de l\'envoi'); }
    finally { setSubmitting(false); }
  }

  function handleRecommander(order: HistoryOrder) {
    const newLines: CartLine[] = [];
    for (const item of order.items) {
      if (!item.product_article_id) continue;
      const article = articles.find(a => a.id === item.product_article_id);
      if (!article) continue;
      const price = calcPrice(article, clientType, clientPrices);
      newLines.push({
        article_id: article.id,
        display_name: article.display_name,
        unit_price: price,
        unit_quantity: article.quantity,
        quantity: item.quantity_ordered,
      });
    }
    if (newLines.length === 0) return;
    setCart(newLines);
    setView('cart');
  }

  async function handleSaveProfil() {
    setProfilSaving(true);
    try {
      const res = await fetch(`/api/portail/${token}/profil`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profil),
      });
      if (res.ok) { setProfilSaved(true); setTimeout(() => setProfilSaved(false), 2500); }
    } finally { setProfilSaving(false); }
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = articles.filter(a => {
    if (selectedCat && a.product_reference?.category?.id !== selectedCat) return false;
    if (search && !a.display_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const myArticles = filtered.filter(a => a.portal_client_ids?.length);
  const allArticles = filtered.filter(a => !a.portal_client_ids?.length);
  const days = nextDays(14);

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
      <AlertCircle size={48} className="text-red-400" />
      <p className="text-gray-700 font-semibold text-lg text-center">{error}</p>
      <p className="text-gray-400 text-sm text-center">Contactez votre fournisseur pour obtenir un lien valide.</p>
    </div>
  );

  // ── Bottom nav ────────────────────────────────────────────────────────────

  const navView = (view === 'cart' || view === 'success') ? 'catalogue' : (view === 'recurrence-new' ? 'recurrences' : view);

  const BottomNav = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex items-center max-w-lg mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {([
        { key: 'catalogue', icon: Package, label: 'Catalogue' },
        { key: 'historique', icon: Clock, label: 'Commandes' },
        { key: 'recurrences', icon: RefreshCw, label: 'Récurrences' },
        { key: 'profil', icon: User, label: 'Profil' },
      ] as const).map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setView(key)}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${navView === key ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <div className="relative">
            <Icon size={19} />
            {key === 'catalogue' && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: 9 }}>
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </div>
          <span className="text-xs font-medium">{label}</span>
        </button>
      ))}
    </div>
  );

  // ── Vue succès ────────────────────────────────────────────────────────────

  if (view === 'success' && successInfo) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 p-6 pb-24 max-w-lg mx-auto">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 w-full text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-xl">Commande envoyée !</p>
          <p className="text-gray-500 text-sm mt-1">Réf. {successInfo.numero}</p>
        </div>
        {successInfo.pending ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-amber-700 text-sm font-medium">En attente de validation</p>
            <p className="text-amber-600 text-xs mt-0.5">Votre commande a été reçue après l'heure limite et sera traitée prochainement.</p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-green-700 text-sm font-medium">Commande confirmée</p>
            <p className="text-green-600 text-xs mt-0.5">Votre commande est enregistrée.</p>
          </div>
        )}
        <button onClick={() => { setView('catalogue'); setSuccessInfo(null); setNote(''); setDeliveryDate(''); setDeliverySlotId(''); }}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 transition-colors">
          Nouvelle commande
        </button>
        <button onClick={() => { setView('historique'); setSuccessInfo(null); }}
          className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-2xl font-semibold hover:bg-gray-200 transition-colors">
          Voir mes commandes
        </button>
      </div>
      <BottomNav />
    </div>
  );

  // ── Vue panier + checkout ─────────────────────────────────────────────────

  if (view === 'cart') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-24">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setView('catalogue')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="font-bold text-gray-900">Mon panier</p>
          <p className="text-xs text-gray-400">{cartCount} article{cartCount > 1 ? 's' : ''} · {formatPrice(cartTotal)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {cart.map(line => (
            <div key={line.article_id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{line.display_name}</p>
                <p className="text-xs text-gray-400">{formatPrice(line.unit_price)} / unité</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setQty(articles.find(a => a.id === line.article_id)!, line.quantity - 1)}
                  className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center font-semibold text-sm">{line.quantity}</span>
                <button onClick={() => setQty(articles.find(a => a.id === line.article_id)!, line.quantity + 1)}
                  className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors">
                  <Plus size={13} />
                </button>
              </div>
              <p className="text-sm font-semibold text-gray-900 w-20 text-right shrink-0">{formatPrice(line.quantity * line.unit_price)}</p>
            </div>
          ))}
        </div>

        {/* Date */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Date de livraison *</p>
          <div className="grid grid-cols-2 gap-2">
            {days.map(d => (
              <button key={d} onClick={() => setDeliveryDate(d)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors text-left ${deliveryDate === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                {formatDay(d)}
              </button>
            ))}
          </div>
        </div>

        {/* Créneau */}
        {slots.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Créneau horaire</p>
            <div className="space-y-2">
              {slots.map(s => (
                <button key={s.id} onClick={() => setDeliverySlotId(prev => prev === s.id ? '' : s.id)}
                  className={`w-full px-4 py-3 rounded-xl text-sm font-medium border transition-colors text-left ${deliverySlotId === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                  {s.name} · {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Note (optionnel)</p>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Instructions de livraison, demande particulière…" rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="bg-white border-t border-gray-100 p-4 space-y-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Total</span>
          <span className="text-xl font-bold text-gray-900">{formatPrice(cartTotal)}</span>
        </div>
        <button onClick={handleSubmit} disabled={!deliveryDate || submitting}
          className="w-full px-4 py-4 bg-blue-600 text-white rounded-2xl font-bold text-base hover:bg-blue-700 disabled:opacity-40 transition-colors">
          {submitting ? 'Envoi en cours…' : 'Confirmer la commande'}
        </button>
        {!deliveryDate && <p className="text-xs text-center text-amber-600">Sélectionnez une date de livraison</p>}
      </div>
    </div>
  );

  // ── Vue historique ────────────────────────────────────────────────────────

  if (view === 'historique') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <p className="font-bold text-gray-900">Mes commandes</p>
        <p className="text-xs text-gray-400 mt-0.5">{client?.nom}</p>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {historyLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : history.length === 0 ? (
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
                    {order.status === 'brouillon' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium border border-amber-200">En attente de validation</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{order.numero}{order.delivery_slot ? ` · ${order.delivery_slot.name}` : ''}</p>
                </div>
                <p className="font-bold text-gray-900 text-sm shrink-0">{formatPrice(order.total)}</p>
              </div>
              <div className="px-4 pb-3 space-y-0.5">
                {order.items.map((item, i) => (
                  <p key={i} className="text-xs text-gray-500">
                    {item.product_article?.display_name ?? '—'} <span className="font-semibold text-gray-700">×{item.quantity_ordered}</span>
                  </p>
                ))}
              </div>
              <div className={`border-t border-gray-50 px-4 py-2.5 flex items-center ${order.has_bl ? 'justify-between' : 'justify-end'}`}>
                {order.has_bl && (
                  <div className="flex items-center gap-1.5">
                    <FileText size={13} className="text-green-600" />
                    <span className="text-xs text-green-700 font-medium">BL disponible</span>
                  </div>
                )}
                <button
                  onClick={() => handleRecommander(order)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors">
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

  // ── Vue profil ────────────────────────────────────────────────────────────

  if (view === 'profil') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <p className="font-bold text-gray-900">Mon profil</p>
        <p className="text-xs text-gray-400 mt-0.5">{client?.nom}</p>
      </div>

      <div className="flex-1 p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Coordonnées</p>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Téléphone</label>
            <input type="tel" value={profil.telephone} onChange={e => setProfil(p => ({ ...p, telephone: e.target.value }))}
              placeholder="06 XX XX XX XX"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
            <input type="email" value={profil.email} onChange={e => setProfil(p => ({ ...p, email: e.target.value }))}
              placeholder="contact@exemple.com"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Adresse de livraison</label>
            <input type="text" value={profil.adresse_livraison} onChange={e => setProfil(p => ({ ...p, adresse_livraison: e.target.value }))}
              placeholder="123 rue de la Paix"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ville</label>
            <input type="text" value={profil.ville} onChange={e => setProfil(p => ({ ...p, ville: e.target.value }))}
              placeholder="Casablanca"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base" />
          </div>
        </div>

        <button onClick={handleSaveProfil} disabled={profilSaving}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${profilSaved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {profilSaved ? <><CheckCircle size={18} /> Enregistré</> : <><Save size={18} /> Enregistrer</>}
        </button>

        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 flex items-center gap-2">
          <Globe size={14} className="text-gray-400 shrink-0" />
          <p className="text-xs text-gray-400">Les modifications seront visibles par votre fournisseur.</p>
        </div>

        {/* Historique dans profil */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">Historique de commandes</p>
          {historyLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <Clock size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Aucune commande</p>
            </div>
          ) : history.slice(0, 5).map(order => {
            const st = STATUS_LABELS[order.status] ?? STATUS_LABELS.brouillon;
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{formatDate(order.delivery_date)}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{order.numero}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 shrink-0">{formatPrice(order.total)}</p>
                </div>
                <div className={`border-t border-gray-50 px-4 py-2.5 flex items-center ${order.has_bl ? 'justify-between' : 'justify-end'}`}>
                  {order.has_bl && (
                    <div className="flex items-center gap-1.5">
                      <FileText size={13} className="text-green-600" />
                      <span className="text-xs text-green-700 font-medium">BL disponible</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleRecommander(order)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors">
                    <RefreshCw size={11} /> Recommander
                  </button>
                </div>
              </div>
            );
          })}
          {history.length > 5 && (
            <button onClick={() => setView('historique')}
              className="w-full py-3 text-sm text-blue-600 font-semibold hover:text-blue-700 transition-colors">
              Voir toutes les commandes ({history.length})
            </button>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );

  // ── Vue récurrences ───────────────────────────────────────────────────────

  if (view === 'recurrences') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="font-bold text-gray-900">Commandes récurrentes</p>
          <p className="text-xs text-gray-400 mt-0.5">{client?.nom}</p>
        </div>
        <button onClick={() => setView('recurrence-new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
          <Plus size={15} /> Nouvelle
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {recurrencesLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : recurrences.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
              <RefreshCw size={24} className="text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm text-center">Aucune commande récurrente<br />Configurez vos commandes automatiques</p>
            <button onClick={() => setView('recurrence-new')}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              <Plus size={15} /> Créer une récurrence
            </button>
          </div>
        ) : (
          recurrences.map(rec => {
            const daysLabel = rec.days_of_week.map(d => JOURS.find(j => j.value === d)?.label ?? d).join(', ');
            return (
              <div key={rec.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${rec.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${rec.is_active ? 'bg-green-50' : 'bg-gray-100'}`}>
                      <RefreshCw size={15} className={rec.is_active ? 'text-green-600' : 'text-gray-400'} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{rec.nom || 'Récurrence'}</p>
                      <p className="text-xs text-gray-400">{daysLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleRecurrence(rec)}
                      className={`p-1.5 rounded-lg transition-colors ${rec.is_active ? 'text-orange-500 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
                      title={rec.is_active ? 'Suspendre' : 'Activer'}>
                      {rec.is_active ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button onClick={() => deleteRecurrence(rec)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {rec.delivery_slot && (
                  <p className="text-xs text-gray-500">Créneau : {rec.delivery_slot.name} · {rec.delivery_slot.start_time.slice(0, 5)}–{rec.delivery_slot.end_time.slice(0, 5)}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {rec.items.map((item, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                      {item.quantity}× {item.display_name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-gray-50 rounded-2xl mx-4 mb-4 border border-gray-100 p-3 flex items-center gap-2">
        <Globe size={13} className="text-gray-400 shrink-0" />
        <p className="text-xs text-gray-400">Les commandes récurrentes sont générées automatiquement chaque jour et envoyées en validation.</p>
      </div>

      <BottomNav />
    </div>
  );

  // ── Vue nouvelle récurrence ───────────────────────────────────────────────

  if (view === 'recurrence-new') return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setView('recurrences')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <p className="font-bold text-gray-900">Nouvelle récurrence</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Nom optionnel */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Libellé (optionnel)</p>
          <input type="text" value={newRecNom} onChange={e => setNewRecNom(e.target.value)}
            placeholder="Ex: Pains quotidiens…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Jours */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Jours de livraison *</p>
          <div className="grid grid-cols-7 gap-1.5">
            {JOURS.map(j => (
              <button key={j.value} type="button"
                onClick={() => setNewRecDays(prev => prev.includes(j.value) ? prev.filter(d => d !== j.value) : [...prev, j.value])}
                className={`py-2 rounded-xl text-xs font-semibold transition-colors ${newRecDays.includes(j.value) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {j.label}
              </button>
            ))}
          </div>
          {newRecDays.length === 0 && <p className="text-xs text-amber-600">Sélectionnez au moins un jour</p>}
        </div>

        {/* Créneau */}
        {slots.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Créneau horaire</p>
            <div className="space-y-2">
              {slots.map(s => (
                <button key={s.id} type="button"
                  onClick={() => setNewRecSlotId(prev => prev === s.id ? '' : s.id)}
                  className={`w-full px-4 py-3 rounded-xl text-sm font-medium border transition-colors text-left ${newRecSlotId === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                  {s.name} · {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Articles */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Articles *</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={newRecSearch} onChange={e => setNewRecSearch(e.target.value)}
              placeholder="Rechercher un article…"
              className="w-full pl-8 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors" />
            {newRecSearch && <button onClick={() => setNewRecSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={13} /></button>}
          </div>

          {newRecSearch && (
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-40 overflow-y-auto">
              {articles.filter(a => a.display_name.toLowerCase().includes(newRecSearch.toLowerCase())).slice(0, 12).map(a => {
                const alreadyIn = newRecItems.find(i => i.article_id === a.id);
                if (alreadyIn) return null;
                const price = calcPrice(a, clientType, clientPrices);
                return (
                  <button key={a.id} type="button"
                    onClick={() => { setNewRecItems(prev => [...prev, { article_id: a.id, display_name: a.display_name, quantity: 1, unit_price: price }]); setNewRecSearch(''); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 transition-colors text-left">
                    <span className="text-sm text-gray-800">{a.display_name}</span>
                    <Plus size={15} className="text-blue-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {newRecItems.length > 0 && (
            <div className="space-y-2">
              {newRecItems.map(item => (
                <div key={item.article_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <p className="flex-1 text-sm font-medium text-gray-800 truncate">{item.display_name}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button"
                      onClick={() => setNewRecItems(prev => item.quantity <= 1 ? prev.filter(i => i.article_id !== item.article_id) : prev.map(i => i.article_id === item.article_id ? { ...i, quantity: i.quantity - 1 } : i))}
                      className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 font-medium text-sm">
                      {item.quantity <= 1 ? <Trash2 size={12} className="text-red-400" /> : '−'}
                    </button>
                    <span className="w-6 text-center font-bold text-sm text-gray-900">{item.quantity}</span>
                    <button type="button"
                      onClick={() => setNewRecItems(prev => prev.map(i => i.article_id === item.article_id ? { ...i, quantity: i.quantity + 1 } : i))}
                      className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 font-medium text-sm">+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {newRecItems.length === 0 && !newRecSearch && (
            <p className="text-xs text-gray-400 text-center py-2">Recherchez des articles à ajouter</p>
          )}
        </div>
      </div>

      <div className="bg-white border-t border-gray-100 p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
        <button onClick={handleCreateRecurrence}
          disabled={newRecSaving || newRecDays.length === 0 || newRecItems.length === 0}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
          <RefreshCw size={18} />
          {newRecSaving ? 'Enregistrement…' : 'Enregistrer la récurrence'}
        </button>
        {(newRecDays.length === 0 || newRecItems.length === 0) && (
          <p className="text-xs text-center text-amber-600 mt-2">
            {newRecDays.length === 0 ? 'Sélectionnez au moins un jour' : 'Ajoutez au moins un article'}
          </p>
        )}
      </div>

      <BottomNav />
    </div>
  );

  // ── Vue catalogue ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            {settings?.logo_url && <img src={settings.logo_url} alt="logo" className="h-7 object-contain mb-0.5" />}
            <p className="text-xs text-gray-400">Bonjour, <span className="font-semibold text-gray-700">{client?.nom}</span></p>
          </div>
          <button onClick={() => setView('cart')} disabled={cart.length === 0}
            className="relative p-3 bg-blue-600 text-white rounded-2xl disabled:opacity-30 hover:bg-blue-700 transition-colors active:scale-95">
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
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
              <button key={c.id} onClick={() => setSelectedCat(prev => prev === c.id ? '' : c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCat === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {myArticles.length > 0 && (
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Mes articles</p>
            <div className="space-y-2">
              {myArticles.map(a => <ArticleCard key={a.id} article={a} qty={getQty(a.id)} clientType={clientType} clientPrices={clientPrices} onQtyChange={setQty} />)}
            </div>
          </section>
        )}
        {allArticles.length > 0 && (
          <section>
            {myArticles.length > 0 && <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Catalogue</p>}
            <div className="space-y-2">
              {allArticles.map(a => <ArticleCard key={a.id} article={a} qty={getQty(a.id)} clientType={clientType} clientPrices={clientPrices} onQtyChange={setQty} />)}
            </div>
          </section>
        )}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package size={40} className="text-gray-200" />
            <p className="text-gray-400 text-sm">Aucun article trouvé</p>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="sticky bottom-16 bg-white border-t border-gray-100 px-4 py-3">
          <button onClick={() => setView('cart')}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 transition-colors">
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-lg">{cartCount}</span>
            <span>Voir mon panier</span>
            <span className="font-bold">{formatPrice(cartTotal)}</span>
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

// ─── ArticleCard ──────────────────────────────────────────────────────────────

function ArticleCard({ article, qty, clientType, clientPrices, onQtyChange }: {
  article: Article; qty: number; clientType: string; clientPrices: Record<string, number>;
  onQtyChange: (article: Article, qty: number) => void;
}) {
  const price = calcPrice(article, clientType, clientPrices);
  const isExclusive = article.portal_client_ids && article.portal_client_ids.length > 0;
  return (
    <div className={`bg-white rounded-2xl border p-4 flex items-center gap-3 transition-all ${qty > 0 ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{article.display_name}</p>
          {isExclusive && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">Exclusif</span>}
        </div>
        <p className="text-sm font-bold text-blue-600 mt-0.5">{formatPrice(price)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {qty > 0 ? (
          <>
            <button onClick={() => onQtyChange(article, qty - 1)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95"><Minus size={14} /></button>
            <span className="w-6 text-center font-bold text-gray-900 text-base">{qty}</span>
            <button onClick={() => onQtyChange(article, qty + 1)} className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors active:scale-95"><Plus size={14} /></button>
          </>
        ) : (
          <button onClick={() => onQtyChange(article, 1)} className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors active:scale-95"><Plus size={14} /></button>
        )}
      </div>
    </div>
  );
}
