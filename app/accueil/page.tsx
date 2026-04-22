'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, ChevronRight, CheckCircle,
  ArrowRight, Send, X, ExternalLink,
} from 'lucide-react';

// ─── Form state ───────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccueilPage() {
  const router = useRouter();


  const [portalToken, setPortalToken] = useState('');
  const [portalError, setPortalError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProspectForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handlePortalAccess() {
    setPortalError('');
    let token = portalToken.trim();
    // Accept full URL or just token
    const match = token.match(/\/portail\/([a-f0-9-]{36})/i);
    if (match) token = match[1];

    // Basic UUID format check
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow">
              <span className="text-white font-black text-base">B</span>
            </div>
            <div>
              <p className="font-black text-gray-900 leading-none">BDK Food</p>
              <p className="text-xs text-gray-400 leading-none mt-0.5">Boulangerie · Pâtisserie · Chocolat</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            Équipe
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 pt-12 pb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
          Bienvenue chez <span className="text-amber-500">BDK Food</span>
        </h1>
        <p className="text-gray-500 mt-3 text-lg max-w-xl mx-auto">
          Commandez en ligne, suivez vos livraisons, gérez votre compte — simplement.
        </p>
      </div>

      {/* Cards */}
      <div className="max-w-5xl mx-auto px-4 pb-16 grid sm:grid-cols-2 gap-5 mt-4">

        {/* Carte 1 — Espace Client Pro */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
              <Building2 size={22} className="text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">Espace Client</p>
              <p className="text-xs text-gray-400">Vous êtes client professionnel</p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Accédez à votre catalogue, passez commande et consultez vos livraisons grâce à votre lien personnel.
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500">Votre lien ou code d'accès</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={portalToken}
                onChange={e => { setPortalToken(e.target.value); setPortalError(''); }}
                onKeyDown={e => e.key === 'Enter' && handlePortalAccess()}
                placeholder="Collez votre lien ici…"
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
              />
              <button
                onClick={handlePortalAccess}
                disabled={!portalToken.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1.5"
              >
                Accéder <ArrowRight size={14} />
              </button>
            </div>
            {portalError && <p className="text-xs text-red-500">{portalError}</p>}
            <p className="text-xs text-gray-400">
              Votre lien vous a été transmis par notre équipe. Si vous ne le trouvez pas,{' '}
              <button onClick={() => setShowForm(true)} className="text-blue-500 underline underline-offset-2">
                faites une demande d'accès
              </button>.
            </p>
          </div>
        </div>

        {/* Carte 2 — Demande d'accès */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0">
              <Send size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="font-bold text-gray-900">Demande d'accès</p>
              <p className="text-xs text-gray-400">Vous n'êtes pas encore client</p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Vous souhaitez commander chez BDK Food ? Renseignez vos informations et notre équipe vous contactera pour créer votre compte.
          </p>

          <div className="bg-amber-50 rounded-2xl p-4 space-y-1.5">
            {['Catalogue professionnel', 'Commandes en ligne 24h/24', 'Suivi des livraisons', 'Historique et BL'].map(item => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle size={14} className="text-amber-500 shrink-0" />
                <span className="text-sm text-gray-700">{item}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="w-full py-3 bg-amber-500 text-white rounded-2xl font-semibold text-sm hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
          >
            Faire une demande <ExternalLink size={15} />
          </button>
        </div>
      </div>

      {/* Footer équipe */}
      <div className="max-w-5xl mx-auto px-4 pb-12 text-center">
        <p className="text-sm text-gray-400">
          Vous faites partie de l'équipe BDK ?{' '}
          <button onClick={() => router.push('/login')} className="text-blue-500 font-medium hover:underline">
            Connexion équipe
          </button>
        </p>
      </div>

      {/* Modale demande d'accès */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!submitting) setShowForm(false); }} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">

            {/* Header modale */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <p className="font-bold text-gray-900">Demande d'ouverture de compte</p>
              {!submitting && (
                <button onClick={() => { setShowForm(false); setSubmitted(false); setForm(EMPTY_FORM); }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Contenu */}
            <div className="overflow-y-auto flex-1">
              {submitted ? (
                <div className="flex flex-col items-center justify-center gap-5 py-12 px-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle size={32} className="text-green-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-gray-900 text-lg">Demande envoyée !</p>
                    <p className="text-gray-500 text-sm mt-2">
                      Notre équipe va étudier votre demande et vous contacter dans les plus brefs délais à l'adresse <strong>{form.email}</strong>.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); setSubmitted(false); setForm(EMPTY_FORM); }}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-2xl font-semibold hover:bg-gray-200 transition-colors">
                    Fermer
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4">

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Raison sociale *</label>
                      <input type="text" required {...field('raison_sociale')}
                        placeholder="SARL Mon Entreprise"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nom du contact *</label>
                      <input type="text" required {...field('nom_contact')}
                        placeholder="Prénom Nom"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Téléphone *</label>
                        <input type="tel" required {...field('telephone')}
                          placeholder="06 XX XX XX XX"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email *</label>
                        <input type="email" required {...field('email')}
                          placeholder="contact@exemple.com"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Adresse</label>
                        <input type="text" {...field('adresse')}
                          placeholder="123 rue…"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ville</label>
                        <input type="text" {...field('ville')}
                          placeholder="Casablanca"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Message (optionnel)</label>
                      <textarea {...field('message')}
                        placeholder="Type de produits souhaités, fréquence de commande…"
                        rows={3}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                  </div>

                  <button type="submit" disabled={submitting}
                    className="w-full py-3.5 bg-amber-500 text-white rounded-2xl font-bold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {submitting ? (
                      <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Envoi en cours…</>
                    ) : (
                      <><Send size={15} /> Envoyer la demande</>
                    )}
                  </button>

                  <p className="text-xs text-gray-400 text-center">
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
