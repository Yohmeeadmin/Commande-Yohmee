'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { CLIENT_TYPES, JOURS_SEMAINE } from '@/types';

export default function EditClientPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    nom: '',
    contact_nom: '',
    telephone: '',
    email: '',
    adresse: '',
    adresse_livraison: '',
    type_client: 'autre',
    jours_livraison: [] as string[],
    horaire_livraison: '',
    note_interne: '',
    is_active: true,
  });

  useEffect(() => {
    loadClient();
  }, [id]);

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
        adresse: data.adresse || '',
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
          adresse: form.adresse || null,
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
            <p className="text-gray-500 mt-1">Modifier les informations</p>
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

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        {/* Infos principales */}
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

        {/* Adresses */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Adresse</label>
            <textarea
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Adresse de livraison</label>
            <textarea
              value={form.adresse_livraison}
              onChange={(e) => setForm({ ...form, adresse_livraison: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Horaire de livraison habituel</label>
            <input
              type="text"
              value={form.horaire_livraison}
              onChange={(e) => setForm({ ...form, horaire_livraison: e.target.value })}
              placeholder="Ex: 07:00-09:00"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Note interne</label>
          <textarea
            value={form.note_interne}
            onChange={(e) => setForm({ ...form, note_interne: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Statut */}
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

        {/* Actions */}
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
