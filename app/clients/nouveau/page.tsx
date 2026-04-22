'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Building2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES, JOURS_SEMAINE } from '@/types';
import { VILLES_MAROC, QUARTIERS_PAR_VILLE } from '@/lib/maroc-geo';

type ClientMode = 'entreprise' | 'particulier';

const INPUT = 'w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base';
const INPUT_SM = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base';

export default function NouveauClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ClientMode>('entreprise');
  const [nomSynced, setNomSynced] = useState(true); // true = nom suit raison_sociale

  const [form, setForm] = useState({
    // Entreprise
    nom: '',
    raison_sociale: '',
    contact_nom: '',
    telephone: '',
    email: '',
    ville: '',
    quartier: '',
    adresse_livraison: '',
    type_client: 'hotel',
    jours_livraison: [] as string[],
    horaire_livraison: '',
    note_interne: '',
    is_active: true,
    code: '',
    ice: '',
    rc: '',
    // Particulier
    prenom: '',
  });

  const quartiersDisponibles = form.ville ? (QUARTIERS_PAR_VILLE[form.ville] || []) : [];

  // Auto-génère le code client (CLT-XXXX) + pré-remplissage depuis demande prospect
  useEffect(() => {
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .then(({ count }: { count: number | null }) => {
        const next = String((count ?? 0) + 1).padStart(4, '0');
        setForm(f => ({ ...f, code: `CLT-${next}` }));
      });

    // Pré-remplissage depuis query params (demande prospect)
    const nom = searchParams.get('nom');
    if (nom) {
      setNomSynced(false);
      setForm(f => ({
        ...f,
        raison_sociale: nom,
        nom,
        contact_nom: searchParams.get('contact') || '',
        telephone: searchParams.get('telephone') || '',
        email: searchParams.get('email') || '',
        adresse_livraison: searchParams.get('adresse_livraison') || '',
        ville: searchParams.get('ville') || '',
        type_client: searchParams.get('type_client') || 'hotel',
      }));
      if (searchParams.get('type_client') === 'entreprise') setMode('entreprise');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync nom <-> raison_sociale
  function handleRaisonSocialeChange(val: string) {
    setForm(f => ({ ...f, raison_sociale: val, nom: nomSynced ? val : f.nom }));
  }

  function handleNomChange(val: string) {
    setNomSynced(false);
    setForm(f => ({ ...f, nom: val }));
  }

  const toggleJour = (jour: string) => setForm(f => ({
    ...f,
    jours_livraison: f.jours_livraison.includes(jour)
      ? f.jours_livraison.filter(j => j !== jour)
      : [...f.jours_livraison, jour],
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomFinal = mode === 'particulier'
      ? [form.prenom, form.nom].filter(Boolean).join(' ')
      : form.nom;
    if (!nomFinal) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('clients').insert({
        nom: nomFinal,
        prenom: mode === 'particulier' ? (form.prenom || null) : null,
        raison_sociale: mode === 'entreprise' ? (form.raison_sociale || null) : null,
        contact_nom: mode === 'entreprise' ? (form.contact_nom || null) : null,
        telephone: form.telephone || null,
        email: form.email || null,
        ville: form.ville || null,
        quartier: form.quartier || null,
        adresse_livraison: form.adresse_livraison || null,
        type_client: mode === 'particulier' ? 'particulier' : form.type_client,
        jours_livraison: mode === 'entreprise' ? form.jours_livraison : [],
        horaire_livraison: mode === 'entreprise' ? (form.horaire_livraison || null) : null,
        note_interne: form.note_interne || null,
        is_active: form.is_active,
        code: form.code || null,
        ice: mode === 'entreprise' ? (form.ice || null) : null,
        rc: mode === 'entreprise' ? (form.rc || null) : null,
      });

      if (error) throw error;
      router.push('/clients');
      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la création du client');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = mode === 'particulier' ? !!form.nom : !!form.nom;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/clients" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouveau client</h1>
          <p className="text-gray-500 mt-1">Ajouter un nouveau client</p>
        </div>
      </div>

      {/* Toggle Entreprise / Particulier */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setMode('entreprise')}
          className={`flex-1 flex items-center justify-center gap-2.5 py-4 rounded-2xl border-2 font-semibold transition-all ${
            mode === 'entreprise'
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
          }`}
        >
          <Building2 size={20} />
          Entreprise
        </button>
        <button
          type="button"
          onClick={() => setMode('particulier')}
          className={`flex-1 flex items-center justify-center gap-2.5 py-4 rounded-2xl border-2 font-semibold transition-all ${
            mode === 'particulier'
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
          }`}
        >
          <User size={20} />
          Particulier
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── FORMULAIRE ENTREPRISE ── */}
        {mode === 'entreprise' && (
          <>
            {/* Identité */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Identité</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Raison sociale</label>
                  <input
                    type="text"
                    value={form.raison_sociale}
                    onChange={e => handleRaisonSocialeChange(e.target.value)}
                    placeholder="Ex: BDK FOOD SARL"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nom commercial{' '}
                    {nomSynced && form.raison_sociale && (
                      <span className="text-xs text-blue-500 font-normal">(auto)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={e => handleNomChange(e.target.value)}
                    placeholder="Nom affiché partout"
                    className={INPUT}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom du contact</label>
                  <input
                    type="text"
                    value={form.contact_nom}
                    onChange={e => setForm(f => ({ ...f, contact_nom: e.target.value }))}
                    placeholder="Prénom Nom"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
                  <select
                    value={form.type_client}
                    onChange={e => setForm(f => ({ ...f, type_client: e.target.value }))}
                    className={INPUT + ' bg-white'}
                  >
                    {CLIENT_TYPES.filter(t => t.value !== 'particulier').map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
                  <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="+212 6XX XXX XXX" className={INPUT} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@exemple.com" className={INPUT} />
                </div>
              </div>
            </div>

            {/* Facturation */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Facturation</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Code client</label>
                  <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="CLT-0001" className={INPUT} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">I.C.E</label>
                  <input type="text" value={form.ice} onChange={e => setForm(f => ({ ...f, ice: e.target.value }))} placeholder="000000000000000" className={INPUT} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">R.C</label>
                  <input type="text" value={form.rc} onChange={e => setForm(f => ({ ...f, rc: e.target.value }))} placeholder="123456" className={INPUT} />
                </div>
              </div>
            </div>

            {/* Adresse */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Adresse</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Ville</label>
                  <select value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value, quartier: '' }))} className={INPUT + ' bg-white'}>
                    <option value="">— Ville —</option>
                    {VILLES_MAROC.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Quartier / Secteur</label>
                  {quartiersDisponibles.length > 0 ? (
                    <select value={form.quartier} onChange={e => setForm(f => ({ ...f, quartier: e.target.value }))} className={INPUT + ' bg-white'}>
                      <option value="">— Quartier —</option>
                      {quartiersDisponibles.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={form.quartier} onChange={e => setForm(f => ({ ...f, quartier: e.target.value }))} disabled={!form.ville} placeholder={form.ville ? 'Saisir le secteur...' : 'Choisir une ville d\'abord'} className={INPUT + ' disabled:bg-gray-50 disabled:text-gray-400'} />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse de livraison</label>
                <textarea value={form.adresse_livraison} onChange={e => setForm(f => ({ ...f, adresse_livraison: e.target.value }))} placeholder="Rue, numéro, complément..." rows={2} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-base" />
              </div>
            </div>

            {/* Livraison */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Livraison</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Jours habituels</label>
                <div className="flex flex-wrap gap-2">
                  {JOURS_SEMAINE.map(jour => (
                    <button key={jour.value} type="button" onClick={() => toggleJour(jour.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${form.jours_livraison.includes(jour.value) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {jour.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Horaire habituel</label>
                <input type="text" value={form.horaire_livraison} onChange={e => setForm(f => ({ ...f, horaire_livraison: e.target.value }))} placeholder="Ex: 07:00-09:00" className={INPUT} />
              </div>
            </div>

            {/* Note */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Note interne</label>
              <textarea value={form.note_interne} onChange={e => setForm(f => ({ ...f, note_interne: e.target.value }))} placeholder="Remarques, préférences..." rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-base" />
            </div>
          </>
        )}

        {/* ── FORMULAIRE PARTICULIER ── */}
        {mode === 'particulier' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Identité</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Prénom</label>
                  <input type="text" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Prénom" className={INPUT} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom *</label>
                  <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom de famille" className={INPUT} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
                  <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="+212 6XX XXX XXX" className={INPUT} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemple.com" className={INPUT} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Localisation</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse</label>
                <textarea value={form.adresse_livraison} onChange={e => setForm(f => ({ ...f, adresse_livraison: e.target.value }))} placeholder="Rue, numéro..." rows={2} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-base" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Ville</label>
                  <select value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value, quartier: '' }))} className={INPUT + ' bg-white'}>
                    <option value="">— Ville —</option>
                    {VILLES_MAROC.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Secteur</label>
                  {quartiersDisponibles.length > 0 ? (
                    <select value={form.quartier} onChange={e => setForm(f => ({ ...f, quartier: e.target.value }))} className={INPUT + ' bg-white'}>
                      <option value="">— Secteur —</option>
                      {quartiersDisponibles.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={form.quartier} onChange={e => setForm(f => ({ ...f, quartier: e.target.value }))} disabled={!form.ville} placeholder="Secteur" className={INPUT + ' disabled:bg-gray-50 disabled:text-gray-400'} />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Note interne</label>
              <textarea value={form.note_interne} onChange={e => setForm(f => ({ ...f, note_interne: e.target.value }))} placeholder="Remarques..." rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-base" />
            </div>
          </>
        )}

        {/* Code client (visible pour les deux modes) */}
        {mode === 'particulier' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Code client</label>
            <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="CLT-0001" className={INPUT} />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/clients" className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={20} />
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
