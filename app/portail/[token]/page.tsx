'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ShoppingCart, Search, X, Plus, Minus, ChevronLeft, CheckCircle, AlertCircle, Package } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalClient {
  id: string;
  nom: string;
  raison_sociale: string | null;
  telephone: string | null;
  email: string | null;
  adresse_livraison: string | null;
  type_client: string;
}

interface PortalSettings {
  company_name: string;
  logo_url: string | null;
  portal_order_deadline: string;
}

interface Category {
  id: string;
  name: string;
}

interface DeliverySlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface Article {
  id: string;
  display_name: string;
  quantity: number;
  unit: string | null;
  prix_particulier: number | null;
  prix_pro: number | null;
  custom_price: number | null;
  portal_client_ids: string[] | null;
  product_reference: {
    id: string;
    name: string;
    base_unit_price: number;
    vat_rate: number;
    category: { id: string; name: string } | null;
  } | null;
}

interface CartLine {
  article_id: string;
  display_name: string;
  unit_price: number;
  unit_quantity: number;
  quantity: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcPrice(article: Article, typeClient: string, clientPrices: Record<string, number>): number {
  if (clientPrices[article.id] !== undefined) return clientPrices[article.id];
  if (typeClient === 'particulier' && article.prix_particulier !== null) return article.prix_particulier;
  if (typeClient === 'entreprise' && article.prix_pro !== null) return article.prix_pro;
  if (article.custom_price !== null) return article.custom_price;
  return (article.product_reference?.base_unit_price ?? 0) * article.quantity;
}

function formatPrice(n: number) {
  return n.toFixed(2).replace('.', ',') + ' MAD';
}

function nextDays(n: number): string[] {
  const days: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < n; i++) {
    days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDay(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Component ────────────────────────────────────────────────────────────────

type View = 'catalogue' | 'cart' | 'success';

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

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const [clientRes, catRes] = await Promise.all([
          fetch(`/api/portail/${token}`),
          fetch(`/api/portail/${token}/catalogue`),
        ]);

        if (!clientRes.ok) {
          const { error: e } = await clientRes.json();
          setError(e || 'Lien invalide');
          return;
        }

        const { client: c, settings: s } = await clientRes.json();
        setClient(c);
        setSettings(s);

        if (catRes.ok) {
          const { articles: a, categories: cats, slots: sl, clientType: ct, clientPrices: cp } = await catRes.json();
          setArticles(a || []);
          setCategories(cats || []);
          setSlots(sl || []);
          setClientType(ct || 'entreprise');
          setClientPrices(cp || {});
        }
      } catch {
        setError('Erreur de connexion');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [token]);

  // ── Cart ──────────────────────────────────────────────────────────────────

  const setQty = useCallback((article: Article, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(l => l.article_id !== article.id));
      return;
    }
    const price = calcPrice(article, clientType, clientPrices);
    setCart(prev => {
      const existing = prev.find(l => l.article_id === article.id);
      if (existing) return prev.map(l => l.article_id === article.id ? { ...l, quantity: qty } : l);
      return [...prev, {
        article_id: article.id,
        display_name: article.display_name,
        unit_price: price,
        unit_quantity: article.quantity,
        quantity: qty,
      }];
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
          items: cart.map(l => ({
            article_id: l.article_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
            unit_quantity: l.unit_quantity,
          })),
          delivery_date: deliveryDate,
          delivery_slot_id: deliverySlotId || null,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccessInfo({ numero: data.numero, pending: data.pending_validation });
      setCart([]);
      setView('success');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'envoi');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Filtered articles ─────────────────────────────────────────────────────

  const filtered = articles.filter(a => {
    if (selectedCat && a.product_reference?.category?.id !== selectedCat) return false;
    if (search && !a.display_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Sépare "mes articles" (exclusifs) du reste
  const myArticles = filtered.filter(a => a.portal_client_ids?.length);
  const allArticles = filtered.filter(a => !a.portal_client_ids?.length);

  const days = nextDays(14);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-gray-700 font-semibold text-lg text-center">{error}</p>
        <p className="text-gray-400 text-sm text-center">Contactez votre fournisseur pour obtenir un lien valide.</p>
      </div>
    );
  }

  // ── Vue succès ──────────────────────────────────────────────────────────
  if (view === 'success' && successInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 p-6">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
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
              <p className="text-amber-600 text-xs mt-0.5">Votre commande a été reçue après l'heure limite. Elle sera traitée prochainement.</p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-green-700 text-sm font-medium">Commande confirmée</p>
              <p className="text-green-600 text-xs mt-0.5">Votre commande est enregistrée et sera livrée à la date choisie.</p>
            </div>
          )}
          <button
            onClick={() => { setView('catalogue'); setSuccessInfo(null); setNote(''); setDeliveryDate(''); setDeliverySlotId(''); }}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Nouvelle commande
          </button>
        </div>
      </div>
    );
  }

  // ── Vue panier + checkout ───────────────────────────────────────────────
  if (view === 'cart') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
        {/* Header */}
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
          {/* Récap articles */}
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {cart.map(line => (
              <div key={line.article_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{line.display_name}</p>
                  <p className="text-xs text-gray-400">{formatPrice(line.unit_price)} / unité</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setQty(articles.find(a => a.id === line.article_id)!, line.quantity - 1)}
                    className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-6 text-center font-semibold text-sm">{line.quantity}</span>
                  <button
                    onClick={() => setQty(articles.find(a => a.id === line.article_id)!, line.quantity + 1)}
                    className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <p className="text-sm font-semibold text-gray-900 w-20 text-right shrink-0">
                  {formatPrice(line.quantity * line.unit_price)}
                </p>
              </div>
            ))}
          </div>

          {/* Date */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Date de livraison *</p>
            <div className="grid grid-cols-2 gap-2">
              {days.map(d => (
                <button
                  key={d}
                  onClick={() => setDeliveryDate(d)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors text-left ${
                    deliveryDate === d
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}
                >
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
                  <button
                    key={s.id}
                    onClick={() => setDeliverySlotId(prev => prev === s.id ? '' : s.id)}
                    className={`w-full px-4 py-3 rounded-xl text-sm font-medium border transition-colors text-left ${
                      deliverySlotId === s.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {s.name} · {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Note (optionnel)</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Instructions de livraison, demande particulière…"
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Total + CTA */}
        <div className="bg-white border-t border-gray-100 p-4 space-y-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-xl font-bold text-gray-900">{formatPrice(cartTotal)}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!deliveryDate || submitting}
            className="w-full px-4 py-4 bg-blue-600 text-white rounded-2xl font-bold text-base hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Envoi en cours…' : 'Confirmer la commande'}
          </button>
          {!deliveryDate && (
            <p className="text-xs text-center text-amber-600">Sélectionnez une date de livraison</p>
          )}
        </div>
      </div>
    );
  }

  // ── Vue catalogue ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            {settings?.logo_url && (
              <img src={settings.logo_url} alt="logo" className="h-7 object-contain mb-0.5" />
            )}
            <p className="text-xs text-gray-400">Bonjour, <span className="font-semibold text-gray-700">{client?.nom}</span></p>
          </div>
          <button
            onClick={() => setView('cart')}
            disabled={cart.length === 0}
            className="relative p-3 bg-blue-600 text-white rounded-2xl disabled:opacity-30 hover:bg-blue-700 transition-colors active:scale-95"
          >
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un article…"
            className="w-full pl-9 pr-9 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Catégories */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            <button
              onClick={() => setSelectedCat('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!selectedCat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Tous
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCat(prev => prev === c.id ? '' : c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCat === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Articles */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-8">
        {myArticles.length > 0 && (
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Mes articles</p>
            <div className="space-y-2">
              {myArticles.map(article => (
                <ArticleCard key={article.id} article={article} qty={getQty(article.id)} clientType={clientType} clientPrices={clientPrices} onQtyChange={setQty} />
              ))}
            </div>
          </section>
        )}

        {allArticles.length > 0 && (
          <section>
            {myArticles.length > 0 && (
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Catalogue</p>
            )}
            <div className="space-y-2">
              {allArticles.map(article => (
                <ArticleCard key={article.id} article={article} qty={getQty(article.id)} clientType={clientType} clientPrices={clientPrices} onQtyChange={setQty} />
              ))}
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

      {/* Barre panier flottante */}
      {cart.length > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 12px, 12px)' }}>
          <button
            onClick={() => setView('cart')}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 transition-colors active:scale-98"
          >
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-lg">{cartCount}</span>
            <span>Voir mon panier</span>
            <span className="font-bold">{formatPrice(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ArticleCard ──────────────────────────────────────────────────────────────

function ArticleCard({
  article, qty, clientType, clientPrices, onQtyChange,
}: {
  article: Article;
  qty: number;
  clientType: string;
  clientPrices: Record<string, number>;
  onQtyChange: (article: Article, qty: number) => void;
}) {
  const price = calcPrice(article, clientType, clientPrices);
  const isExclusive = article.portal_client_ids && article.portal_client_ids.length > 0;

  return (
    <div className={`bg-white rounded-2xl border p-4 flex items-center gap-3 transition-all ${qty > 0 ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{article.display_name}</p>
          {isExclusive && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">Exclusif</span>
          )}
        </div>
        <p className="text-sm font-bold text-blue-600 mt-0.5">{formatPrice(price)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {qty > 0 ? (
          <>
            <button
              onClick={() => onQtyChange(article, qty - 1)}
              className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center font-bold text-gray-900 text-base">{qty}</span>
            <button
              onClick={() => onQtyChange(article, qty + 1)}
              className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors active:scale-95"
            >
              <Plus size={14} />
            </button>
          </>
        ) : (
          <button
            onClick={() => onQtyChange(article, 1)}
            className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors active:scale-95"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
