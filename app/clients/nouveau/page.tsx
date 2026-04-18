'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES, JOURS_SEMAINE } from '@/types';
import { VILLES_MAROC, QUARTIERS_PAR_VILLE } from '@/lib/maroc-geo';

export default function NouveauClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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
    code: '',
    ice: '',
  });

  const quartiersDisponibles = form.ville ? (QUARTIERS_PAR_VILLE[form.ville] || []) : [];

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
      const { error } = await supabase.from('clients').insert({
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
        code: form.code || null,
        ice: form.ice || null,
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

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Nom / Société *</label>
            <input
              type="text"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="Ex: Hôtel Royal Mansour"
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
              placeholder="Ex: Ahmed Ben Ali"
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
              placeholder="+212 6XX XXX XXX"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="contact@exemple.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Localisation */}
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
              placeholder="Rue, numéro, complément d'adresse..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Facturation */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Code client</label>
            <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
              placeholder="CLT-0001"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">I.C.E</label>
            <input type="text" value={form.ice} onChange={e => setForm({ ...form, ice: e.target.value })}
              placeholder="000000000000000"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
        </div>

        {/* Livraison */}
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
            placeholder="Remarques, préférences, informations utiles..."
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
    </div>
  );
}
