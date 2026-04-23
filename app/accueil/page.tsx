'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Send, X, CheckCircle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  description_publique: string | null;
  photo_url: string | null;
  atelier: string;
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

interface ProspectForm {
  raison_sociale: string;
  nom_contact: string;
  telephone: string;
  email: string;
  adresse: string;
  ville: string;
  message: string;
}

const EMPTY_FORM: ProspectForm = {
  raison_sociale: '', nom_contact: '', telephone: '', email: '',
  adresse: '', ville: '', message: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false);
  const hasDesc = !!product.description_publique;

  return (
    <div className="group border border-black/10 bg-white overflow-hidden">
      {/* Photo */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {product.photo_url ? (
          <Image
            src={product.photo_url}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-black text-gray-200">{product.name.charAt(0)}</span>
          </div>
        )}
      </div>

      {/* Infos */}
      <div className="p-4 border-t border-black/10">
        <p className="font-black text-sm uppercase tracking-widest text-black leading-tight">
          {product.name}
        </p>

        {hasDesc && (
          <div className="mt-3">
            {expanded && (
              <p className="text-xs text-gray-600 leading-relaxed mb-3">
                {product.description_publique}
              </p>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-black hover:opacity-60 transition-opacity"
            >
              {expanded ? (
                <><ChevronUp size={12} /> FERMER</>
              ) : (
                <><ChevronDown size={12} /> EN SAVOIR PLUS</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccueilPage() {
  const router = useRouter();

  // Data
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [settings, setSettings] = useState<LandingSettings>({
    landing_title: 'BDK',
    landing_subtitle: null,
    logo_url: null,
  });
  const [activeAtelier, setActiveAtelier] = useState<string>('');
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);

  // Portal access
  const [portalToken, setPortalToken] = useState('');
  const [portalError, setPortalError] = useState('');

  // Prospect form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProspectForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const { error } = await res.json();
        alert(error || 'Une erreur est survenue.');
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  const field = (key: keyof ProspectForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  });

  const activeProducts = ateliers.find(a => a.name === activeAtelier)?.products ?? [];

  return (
    <div className="min-h-screen bg-white text-black font-sans">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-black/10">
        <div className="w-full pl-4 pr-5 py-0 flex items-center justify-between" style={{ minHeight: 56 }}>
          {/* Logo */}
          <div className="flex items-center">
            <Image src="/bdk-noir.png" alt="BDK" width={220} height={80} className="h-20 w-auto object-contain" />
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-6">
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
              onClick={() => setShowForm(true)}
              className="px-8 py-3.5 border border-black text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
            >
              Faire une demande
            </button>
          </div>
        </div>
      </section>

      {/* ── CATALOGUE ──────────────────────────────────────────────────────── */}
      <section id="catalogue-section">
        {/* Atelier tabs */}
        {ateliers.length > 0 && (
          <div className="border-b border-black/10 sticky top-[61px] z-30 bg-white">
            <div className="max-w-6xl mx-auto px-5">
              <div className="flex overflow-x-auto scrollbar-none">
                {ateliers.map(a => (
                  <button
                    key={a.name}
                    onClick={() => setActiveAtelier(a.name)}
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

        {/* Products grid */}
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
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── ESPACE CLIENT ──────────────────────────────────────────────────── */}
      <section id="acces-section" className="border-t border-black/10 bg-black text-white">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="grid sm:grid-cols-2 gap-16">

            {/* Col 1 — Accès portail */}
            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-3">
                  Vous êtes client
                </p>
                <h2 className="text-3xl font-black uppercase leading-tight">
                  Accédez à<br />votre espace
                </h2>
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
                <p className="text-xs text-white/30">
                  Votre lien vous a été transmis par notre équipe.
                </p>
              </div>
            </div>

            {/* Col 2 — Demande */}
            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-3">
                  Pas encore client
                </p>
                <h2 className="text-3xl font-black uppercase leading-tight">
                  Ouvrir un<br />compte pro
                </h2>
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
                onClick={() => setShowForm(true)}
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

      {/* ── MODALE PROSPECT ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => { if (!submitting) setShowForm(false); }}
          />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-none shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 bg-black text-white shrink-0">
              <p className="font-black text-sm uppercase tracking-widest">Demande d'accès</p>
              {!submitting && (
                <button
                  onClick={() => { setShowForm(false); setSubmitted(false); setForm(EMPTY_FORM); }}
                  className="w-8 h-8 flex items-center justify-center border border-white/20 text-white/60 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1">
              {submitted ? (
                <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center">
                  <div className="w-14 h-14 border-2 border-black flex items-center justify-center">
                    <CheckCircle size={28} />
                  </div>
                  <div>
                    <p className="font-black text-xl uppercase tracking-tight">Demande envoyée</p>
                    <p className="text-black/50 text-sm mt-2">
                      Notre équipe va vous contacter à l'adresse <strong>{form.email}</strong>.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); setSubmitted(false); setForm(EMPTY_FORM); }}
                    className="px-8 py-3 border border-black text-sm font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
                  {[
                    { label: 'Raison sociale *', key: 'raison_sociale' as const, type: 'text', placeholder: 'SARL Mon Entreprise', required: true },
                    { label: 'Nom du contact *', key: 'nom_contact' as const, type: 'text', placeholder: 'Prénom Nom', required: true },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">{f.label}</label>
                      <input type={f.type} required={f.required} {...field(f.key)}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                    </div>
                  ))}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Téléphone *</label>
                      <input type="tel" required {...field('telephone')}
                        placeholder="06 XX XX XX XX"
                        className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Email *</label>
                      <input type="email" required {...field('email')}
                        placeholder="contact@exemple.com"
                        className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Adresse</label>
                      <input type="text" {...field('adresse')}
                        placeholder="123 rue…"
                        className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Ville</label>
                      <input type="text" {...field('ville')}
                        placeholder="Marrakech"
                        className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-black/50 mb-1.5">Message (optionnel)</label>
                    <textarea {...field('message')}
                      placeholder="Type de produits, fréquence de commande…"
                      rows={3}
                      className="w-full px-3 py-2.5 border border-black/20 text-sm focus:outline-none focus:border-black resize-none" />
                  </div>

                  <button type="submit" disabled={submitting}
                    className="w-full py-4 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {submitting ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Envoi…</>
                    ) : (
                      <><Send size={14} /> Envoyer la demande</>
                    )}
                  </button>

                  <p className="text-xs text-black/30 text-center">
                    Vos données sont utilisées uniquement pour traiter votre demande.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
