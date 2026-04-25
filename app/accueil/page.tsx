'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Send, X, CheckCircle, ArrowRight, Plus, Minus, ShoppingBag, ShoppingCart, Trash2 } from 'lucide-react';
import Image from 'next/image';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  display_name: string;
  quantity: number;
  unit: string | null;
  prix_particulier: number | null;
  prix_pro: number | null;
  custom_price: number | null;
  price: number; // computed by API
}

interface Product {
  id: string;
  name: string;
  description_publique: string | null;
  photo_url: string | null;
  atelier: string;
  base_unit_price: number;
  vat_rate: number;
  category_id: string | null;
  category_name: string | null;
  articles: Article[];
}

interface Atelier {
  name: string;
  products: Product[];
}

interface LandingSettings {
  landing_title: string;
  landing_subtitle: string | null;
  logo_url: string | null;
}

interface CartItem {
  article_id: string;
  product_id: string;
  product_name: string;
  display_name: string;
  unit_price: number;
  vat_rate: number;
  quantity: number;
}

interface DevisForm {
  raison_sociale: string;
  nom_contact: string;
  telephone: string;
  email: string;
  adresse: string;
  ville: string;
  message: string;
}

const EMPTY_FORM: DevisForm = {
  raison_sociale: '', nom_contact: '', telephone: '', email: '',
  adresse: '', ville: '', message: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Product Card ─────────────────────────────────────────────────────────────

// ─── Product Detail Modal ─────────────────────────────────────────────────────

function ProductDetailModal({
  product, cart, onClose, onSetQty,
}: {
  product: Product;
  cart: CartItem[];
  onClose: () => void;
  onSetQty: (article: Article, product: Product, qty: number) => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  function getQty(articleId: string) {
    return cart.find(l => l.article_id === articleId)?.quantity ?? 0;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#f5f0e8] border border-black w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center hover:opacity-60 transition-opacity">
          <X size={20} />
        </button>

        {/* Image */}
        <div className="w-full md:w-1/2 aspect-square md:aspect-auto md:min-h-[420px] bg-gray-200 relative shrink-0 border-b md:border-b-0 md:border-r border-black">
          {product.photo_url ? (
            <Image src={product.photo_url} alt={product.name} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-8xl font-black text-gray-300">{product.name.charAt(0)}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col overflow-y-auto">
          <div className="border-b border-black p-8 md:p-10 pb-6">
            <h2 className="text-4xl md:text-5xl font-black uppercase leading-none tracking-tight">{product.name}</h2>
            {product.description_publique && (
              <p className="text-sm text-black/60 leading-relaxed mt-4">{product.description_publique}</p>
            )}
          </div>

          {/* Articles */}
          {product.articles.length > 0 && (
            <div className="flex-1 overflow-y-auto">
              <p className="px-8 md:px-10 pt-6 pb-3 text-xs font-black uppercase tracking-widest text-black/40">Choisir un format</p>
              {product.articles.map(article => {
                const qty = getQty(article.id);
                return (
                  <div key={article.id} className={`flex items-center gap-3 px-8 md:px-10 py-3 border-t border-black/10 ${qty > 0 ? 'bg-black/[0.03]' : ''}`}>
                    <p className="flex-1 text-sm font-medium text-black">{article.display_name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {qty > 0 ? (
                        <>
                          <button onClick={() => onSetQty(article, product, qty - 1)}
                            className="w-8 h-8 border border-black/20 flex items-center justify-center hover:bg-black/5 transition-colors">
                            <Minus size={12} />
                          </button>
                          <span className="w-6 text-center font-black text-sm">{qty}</span>
                          <button onClick={() => onSetQty(article, product, qty + 1)}
                            className="w-8 h-8 bg-black text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                            <Plus size={12} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => onSetQty(article, product, 1)}
                          className="flex items-center gap-2 px-4 py-2 border border-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors">
                          <Plus size={12} /> Ajouter
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product, cart, onShowDetail, onSetQty,
}: {
  product: Product;
  cart: CartItem[];
  onShowDetail: (product: Product) => void;
  onSetQty: (article: Article, product: Product, qty: number) => void;
}) {
  const hasArticles = product.articles.length > 0;
  const cartQty = cart.filter(l => l.product_id === product.id).reduce((s, l) => s + l.quantity, 0);

  function handleCartClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!hasArticles) return;
    if (product.articles.length === 1) {
      const article = product.articles[0];
      const current = cart.find(l => l.article_id === article.id)?.quantity ?? 0;
      onSetQty(article, product, current + 1);
    } else {
      onShowDetail(product);
    }
  }

  return (
    <div className="group border border-black/10 bg-white overflow-hidden">
      <div className="aspect-square bg-gray-100 relative overflow-hidden cursor-pointer" onClick={() => onShowDetail(product)}>
        {product.photo_url ? (
          <Image src={product.photo_url} alt={product.name} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-black text-gray-200">{product.name.charAt(0)}</span>
          </div>
        )}
        {/* Cart badge */}
        {cartQty > 0 && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-black text-white text-xs font-black rounded-full flex items-center justify-center">
            {cartQty}
          </div>
        )}
        {/* Add button on hover */}
        {hasArticles && (
          <button
            onClick={handleCartClick}
            className="absolute bottom-2 right-2 w-9 h-9 bg-white border border-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-black hover:text-white"
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      <div className="p-4 border-t border-black/10">
        <p className="font-black text-sm uppercase tracking-widest text-black leading-tight">{product.name}</p>
      </div>
    </div>
  );
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────

function CartDrawer({
  cart, onSetQty, onClose, onRequestDevis,
}: {
  cart: CartItem[];
  onSetQty: (articleId: string, qty: number) => void;
  onClose: () => void;
  onRequestDevis: () => void;
}) {
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm flex flex-col shadow-2xl border-l border-black/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} />
            <p className="font-black text-sm uppercase tracking-widest">Panier</p>
            {cartCount > 0 && (
              <span className="w-5 h-5 bg-black text-white text-xs font-black rounded-full flex items-center justify-center">{cartCount}</span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:opacity-60 transition-opacity">
            <X size={18} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
              <ShoppingCart size={32} className="text-black/20" />
              <p className="text-sm text-black/40 font-medium">Votre panier est vide</p>
              <p className="text-xs text-black/30">Ajoutez des produits depuis le catalogue</p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {cart.map(item => (
                <div key={item.article_id} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-black/40 uppercase tracking-wide font-bold">{item.product_name}</p>
                    <p className="text-sm font-medium text-black truncate">{item.display_name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => onSetQty(item.article_id, item.quantity - 1)}
                      className="w-7 h-7 border border-black/20 flex items-center justify-center hover:bg-black/5 transition-colors">
                      {item.quantity === 1 ? <Trash2 size={11} /> : <Minus size={11} />}
                    </button>
                    <span className="w-6 text-center font-black text-sm">{item.quantity}</span>
                    <button onClick={() => onSetQty(item.article_id, item.quantity + 1)}
                      className="w-7 h-7 bg-black text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-black/10 p-5">
          <button
            onClick={onRequestDevis}
            disabled={cart.length === 0}
            className="w-full py-4 bg-black text-white text-xs font-black uppercase tracking-widest hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Send size={13} /> Demander un devis
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Devis Form Modal ─────────────────────────────────────────────────────────

function DevisFormModal({
  cart, onClose,
}: {
  cart: CartItem[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<DevisForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const field = (key: keyof DevisForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/devis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          items: cart.map(l => ({
            article_id: l.article_id,
            display_name: `${l.product_name} — ${l.display_name}`,
            quantity: l.quantity,
            unit_price: l.unit_price,
            vat_rate: l.vat_rate,
          })),
        }),
      });
      if (!res.ok) { const { error } = await res.json(); alert(error || 'Erreur'); return; }
      setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={!submitting && !success ? onClose : undefined} />
      <div className="relative bg-white w-full sm:max-w-lg max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 bg-black text-white shrink-0">
          <div>
            <p className="font-black text-xs uppercase tracking-widest">{success ? 'Demande envoyée' : 'Vos coordonnées'}</p>
            {!success && <p className="text-white/40 text-xs mt-0.5">{cart.reduce((s,l)=>s+l.quantity,0)} article{cart.reduce((s,l)=>s+l.quantity,0)>1?'s':''} dans le panier</p>}
          </div>
          {!submitting && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center border border-white/20 text-white/60 hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center">
            <div className="w-14 h-14 border-2 border-black flex items-center justify-center">
              <CheckCircle size={28} />
            </div>
            <div>
              <p className="font-black text-2xl uppercase tracking-tight">Demande envoyée !</p>
              <p className="text-black/50 text-sm mt-2 leading-relaxed">
                Votre demande a bien été reçue.<br />
                Un récapitulatif a été envoyé à <strong className="text-black">{form.email}</strong>.<br />
                Notre équipe vous contactera rapidement.
              </p>
            </div>
            <button onClick={onClose} className="px-8 py-3 border border-black text-sm font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors">
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Recap */}
            <div className="px-6 py-3 border-b border-black/5 bg-gray-50 shrink-0 max-h-28 overflow-y-auto">
              {cart.map(l => (
                <div key={l.article_id} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-black/60 truncate mr-2">{l.quantity}× {l.product_name} — {l.display_name}</span>
                </div>
              ))}
            </div>

            <form id="devis-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {([
                { label: 'Raison sociale *', key: 'raison_sociale' as const, type: 'text', placeholder: 'SARL Mon Entreprise', required: true },
                { label: 'Nom du contact *', key: 'nom_contact' as const, type: 'text', placeholder: 'Prénom Nom', required: true },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">{f.label}</label>
                  <input type={f.type} required={f.required} {...field(f.key)} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Téléphone *</label>
                  <input type="tel" required {...field('telephone')} placeholder="06 XX XX XX XX"
                    className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Email *</label>
                  <input type="email" required {...field('email')} placeholder="contact@exemple.com"
                    className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Adresse</label>
                  <input type="text" {...field('adresse')} placeholder="123 rue…"
                    className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Ville</label>
                  <input type="text" {...field('ville')} placeholder="Marrakech"
                    className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Message (optionnel)</label>
                <textarea {...field('message')} placeholder="Fréquence de livraison, volume estimé…" rows={3}
                  className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black resize-none" />
              </div>
            </form>

            <div className="shrink-0 border-t border-black/10 px-6 py-4 bg-white">
              <button type="submit" form="devis-form" disabled={submitting}
                className="w-full py-4 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Envoi…</>
                ) : (
                  <><Send size={13} /> Envoyer la demande</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccueilPage() {
  const router = useRouter();

  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [settings, setSettings] = useState<LandingSettings>({
    landing_title: 'BDK',
    landing_subtitle: null,
    logo_url: null,
  });
  const [activeAtelier, setActiveAtelier] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);

  const [portalToken, setPortalToken] = useState('');
  const [portalError, setPortalError] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showDevisForm, setShowDevisForm] = useState(false);

  // Detail modal
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  function setQty(article: Article, product: Product, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(l => l.article_id !== article.id));
    } else {
      setCart(prev => {
        const existing = prev.find(l => l.article_id === article.id);
        if (existing) return prev.map(l => l.article_id === article.id ? { ...l, quantity: qty } : l);
        return [...prev, { article_id: article.id, product_id: product.id, product_name: product.name, display_name: article.display_name, unit_price: article.price, vat_rate: product.vat_rate, quantity: qty }];
      });
    }
  }

  function setQtyById(articleId: string, qty: number) {
    if (qty <= 0) setCart(prev => prev.filter(l => l.article_id !== articleId));
    else setCart(prev => prev.map(l => l.article_id === articleId ? { ...l, quantity: qty } : l));
  }

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);

  useEffect(() => {
    fetch('/api/landing/catalogue')
      .then(r => r.json())
      .then(data => {
        setAteliers(data.ateliers ?? []);
        if (data.settings) setSettings(data.settings);
        if (data.ateliers?.length) setActiveAtelier(data.ateliers[0].name);
      })
      .catch(() => {})
      .finally(() => setLoadingCatalogue(false));
  }, []);

  function handlePortalAccess() {
    setPortalError('');
    let token = portalToken.trim();
    const match = token.match(/\/portail\/([a-f0-9-]{36})/i);
    if (match) token = match[1];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      setPortalError('Lien invalide. Copiez le lien exact qui vous a été envoyé.');
      return;
    }
    router.push(`/portail/${token}`);
  }

  const allActiveProducts = ateliers.find(a => a.name === activeAtelier)?.products ?? [];

  // Catégories disponibles pour l'atelier actif (ordonnées par ordre d'apparition)
  const activeCategories = Array.from(
    new Map(
      allActiveProducts
        .filter(p => p.category_id && p.category_name)
        .map(p => [p.category_id!, p.category_name!])
    ).entries()
  ).map(([id, nom]) => ({ id, nom }));

  const activeProducts = activeCategory
    ? allActiveProducts.filter(p => p.category_id === activeCategory)
    : allActiveProducts;

  return (
    <div className="min-h-screen bg-white text-black font-sans">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-black/10">
        <div className="w-full pl-4 pr-5 py-0 flex items-center justify-between" style={{ minHeight: 56 }}>
          <div className="flex items-center">
            <Image src="/bdk-noir.png" alt="BDK" width={220} height={80} className="h-20 w-auto object-contain" />
          </div>
          <nav className="flex items-center gap-4">
            <button
              onClick={() => document.getElementById('catalogue-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="hidden sm:block text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black transition-colors"
            >
              Catalogue
            </button>
            <button
              onClick={() => document.getElementById('acces-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="hidden sm:block text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black transition-colors"
            >
              Mon espace
            </button>
            {/* Cart icon */}
            <button
              onClick={() => setShowCart(true)}
              className="relative w-10 h-10 flex items-center justify-center border border-black/10 hover:border-black transition-colors"
            >
              <ShoppingCart size={18} />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push('/login')}
              className="text-xs font-bold uppercase tracking-widest px-4 py-2 border border-black text-black hover:bg-black hover:text-white transition-colors"
            >
              Connexion
            </button>
          </nav>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section className="border-b border-black/10">
        <div className="max-w-6xl mx-auto px-5 py-20 sm:py-32">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-black/40 mb-6">
            Le savoir-faire au service du professionnel
          </p>
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black uppercase leading-none tracking-tighter text-black">
            {settings.landing_title}
          </h1>
          {settings.landing_subtitle && (
            <p className="text-base sm:text-lg text-black/50 mt-6 font-medium tracking-wide">
              {settings.landing_subtitle}
            </p>
          )}
          <div className="mt-10 flex flex-wrap gap-3">
            <button
              onClick={() => document.getElementById('catalogue-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-3.5 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80 transition-colors"
            >
              Voir le catalogue
            </button>
            <button
              onClick={() => setShowCart(true)}
              className="px-8 py-3.5 border border-black text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
            >
              Demander un devis
            </button>
          </div>
        </div>
      </section>

      {/* ── CATALOGUE ──────────────────────────────────────────────────────── */}
      <section id="catalogue-section">
        {ateliers.length > 0 && (
          <div className="border-b border-black/10 sticky top-[61px] z-30 bg-white">
            <div className="max-w-6xl mx-auto px-5">
              <div className="flex overflow-x-auto scrollbar-none">
                {ateliers.map(a => (
                  <button
                    key={a.name}
                    onClick={() => { setActiveAtelier(a.name); setActiveCategory(null); }}
                    className={`shrink-0 px-5 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                      activeAtelier === a.name
                        ? 'border-black text-black'
                        : 'border-transparent text-black/40 hover:text-black/70'
                    }`}
                  >
                    {capitalize(a.name)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filtre catégories */}
        {activeCategories.length > 0 && (
          <div className="border-b border-black/10 bg-white">
            <div className="max-w-6xl mx-auto px-5">
              <div className="flex justify-center overflow-x-auto scrollbar-none gap-2 py-3">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`shrink-0 px-4 py-1.5 text-xs font-bold uppercase tracking-widest border transition-colors ${
                    activeCategory === null
                      ? 'border-black bg-black text-white'
                      : 'border-black/20 text-black/50 hover:border-black/50 hover:text-black'
                  }`}
                >
                  Tous
                </button>
                {activeCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`shrink-0 px-4 py-1.5 text-xs font-bold uppercase tracking-widest border transition-colors ${
                      activeCategory === cat.id
                        ? 'border-black bg-black text-white'
                        : 'border-black/20 text-black/50 hover:border-black/50 hover:text-black'
                    }`}
                  >
                    {cat.nom}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-5 py-12">
          {loadingCatalogue ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            </div>
          ) : ateliers.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-black/30 text-sm font-medium uppercase tracking-widest">
                Catalogue en cours de mise à jour
              </p>
            </div>
          ) : activeProducts.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-black/30 text-sm font-medium uppercase tracking-widest">
                Aucun produit dans cet atelier
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-black/10">
              {activeProducts.map(product => (
                <div key={product.id} className="bg-white">
                  <ProductCard product={product} cart={cart} onShowDetail={setDetailProduct} onSetQty={setQty} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA devis global */}
        {!loadingCatalogue && ateliers.length > 0 && (
          <div className="border-t border-black/10 py-12 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-black/30 mb-4">
              Besoin d'une offre personnalisée ?
            </p>
            <button
              onClick={() => setShowCart(true)}
              className="inline-flex items-center gap-2 px-10 py-4 border border-black text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
            >
              <ShoppingCart size={14} /> Voir mon panier
            </button>
          </div>
        )}
      </section>

      {/* ── ESPACE CLIENT ──────────────────────────────────────────────────── */}
      <section id="acces-section" className="border-t border-black/10 bg-black text-white">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="grid sm:grid-cols-2 gap-16">

            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-3">Vous êtes client</p>
                <h2 className="text-3xl font-black uppercase leading-tight">Accédez à<br />votre espace</h2>
              </div>
              <p className="text-sm text-white/60 leading-relaxed">
                Passez vos commandes, consultez vos livraisons et gérez votre compte en ligne grâce à votre lien personnel.
              </p>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={portalToken}
                    onChange={e => { setPortalToken(e.target.value); setPortalError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handlePortalAccess()}
                    placeholder="Collez votre lien d'accès…"
                    className="flex-1 px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white min-w-0"
                  />
                  <button
                    onClick={handlePortalAccess}
                    disabled={!portalToken.trim()}
                    className="px-5 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-white/90 disabled:opacity-30 transition-colors shrink-0 flex items-center gap-2"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
                {portalError && <p className="text-xs text-red-400">{portalError}</p>}
                <p className="text-xs text-white/30">Votre lien vous a été transmis par notre équipe.</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-3">Pas encore client</p>
                <h2 className="text-3xl font-black uppercase leading-tight">Ouvrir un<br />compte pro</h2>
              </div>
              <p className="text-sm text-white/60 leading-relaxed">
                Boulangeries, restaurants, hôtels, cafés — faites une demande et notre équipe vous contactera.
              </p>
              <div className="space-y-2">
                {['Catalogue professionnel', 'Commandes en ligne 24h/24', 'Suivi des livraisons en temps réel', 'Historique et bons de livraison'].map(item => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                    <div className="w-1 h-1 bg-white/40 rounded-full shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowCart(true)}
                className="inline-flex items-center gap-3 px-8 py-3.5 border border-white text-white text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-colors"
              >
                Faire une demande <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-black/10 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-black/30 uppercase tracking-widest">
            © {new Date().getFullYear()} {settings.landing_title}
          </p>
          <button
            onClick={() => router.push('/login')}
            className="text-xs text-black/30 hover:text-black uppercase tracking-widest transition-colors flex items-center gap-1"
          >
            Connexion équipe <ChevronRight size={12} />
          </button>
        </div>
      </footer>

      {/* ── PRODUCT DETAIL MODAL ────────────────────────────────────────────── */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          cart={cart}
          onClose={() => setDetailProduct(null)}
          onSetQty={setQty}
        />
      )}

      {/* ── CART DRAWER ─────────────────────────────────────────────────────── */}
      {showCart && (
        <CartDrawer
          cart={cart}
          onSetQty={setQtyById}
          onClose={() => setShowCart(false)}
          onRequestDevis={() => { setShowCart(false); setShowDevisForm(true); }}
        />
      )}

      {/* ── DEVIS FORM ──────────────────────────────────────────────────────── */}
      {showDevisForm && (
        <DevisFormModal
          cart={cart}
          onClose={() => { setShowDevisForm(false); setCart([]); }}
        />
      )}
    </div>
  );
}
