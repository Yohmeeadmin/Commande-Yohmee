'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2, Search, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Client, ProductArticle, ProductReference, DeliverySlot, JOURS_SEMAINE } from '@/types';

interface RecurrenceLine {
  id: string;
  product_id: string;
  product_nom: string;
  quantite: number;
  note: string;
}

export default function EditRecurrencePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<(ProductArticle & { product_reference: ProductReference })[]>([]);
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [searchProduct, setSearchProduct] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    client_id: '',
    nom: '',
    type_recurrence: 'hebdo' as 'quotidien' | 'hebdo',
    jours_semaine: [] as string[],
    date_debut: today,
    delivery_slot_id: '',
    note: '',
    is_active: true,
  });

  const [lines, setLines] = useState<RecurrenceLine[]>([]);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    setLoadingData(true);
    try {
      const [{ data: clientsData }, { data: articlesData }, { data: slotsData }, { data: recurrence, error: recurrenceError }] = await Promise.all([
        supabase.from('clients').select('*').eq('is_active', true).order('nom'),
        supabase.from('product_articles').select('*, product_reference:product_references(name, code, atelier)').eq('is_active', true).order('display_name'),
        supabase.from('delivery_slots').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('recurring_orders').select('*').eq('id', id).single(),
      ]);

      setClients(clientsData || []);
      setArticles((articlesData as any) || []);
      setDeliverySlots(slotsData || []);

      if (recurrenceError || !recurrence) {
        router.push('/recurrences');
        return;
      }

      setForm({
        client_id: recurrence.client_id,
        nom: recurrence.nom || '',
        type_recurrence: recurrence.type_recurrence,
        jours_semaine: recurrence.jours_semaine || [],
        date_debut: recurrence.date_debut,
        delivery_slot_id: recurrence.delivery_slot_id || '',
        note: recurrence.note || '',
        is_active: recurrence.is_active,
      });

      // Charger les articles de la récurrence
      const { data: items } = await supabase
        .from('recurring_order_items')
        .select('*, product_article:product_articles!product_article_id(display_name)')
        .eq('recurring_order_id', id);

      setLines((items || []).map((item: any) => ({
        id: crypto.randomUUID(),
        product_id: item.product_article_id || '',
        product_nom: item.product_article?.display_name || item.product_nom || 'Article',
        quantite: item.quantite,
        note: item.note || '',
      })));
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoadingData(false);
    }
  }

  const toggleJour = (jour: string) => {
    setForm({
      ...form,
      jours_semaine: form.jours_semaine.includes(jour)
        ? form.jours_semaine.filter(j => j !== jour)
        : [...form.jours_semaine, jour],
    });
  };

  const addArticle = (article: ProductArticle & { product_reference: ProductReference }) => {
    setLines([...lines, {
      id: crypto.randomUUID(),
      product_id: article.id,
      product_nom: article.display_name,
      quantite: 1,
      note: '',
    }]);
    setSearchProduct('');
  };

  const updateLine = (lineId: string, updates: Partial<RecurrenceLine>) => {
    setLines(lines.map(l => l.id === lineId ? { ...l, ...updates } : l));
  };

  const removeLine = (lineId: string) => {
    setLines(lines.filter(l => l.id !== lineId));
  };

  const filteredArticles = articles.filter(a =>
    a.display_name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    (a.product_reference as any)?.name?.toLowerCase().includes(searchProduct.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id || lines.length === 0) {
      alert('Veuillez sélectionner un client et ajouter au moins un article');
      return;
    }
    if (form.type_recurrence === 'hebdo' && form.jours_semaine.length === 0) {
      alert('Veuillez sélectionner au moins un jour');
      return;
    }

    setLoading(true);
    try {
      // 1. Mettre à jour les infos de la récurrence
      const { error: updateError } = await supabase
        .from('recurring_orders')
        .update({
          client_id: form.client_id,
          nom: form.nom || null,
          type_recurrence: form.type_recurrence,
          jours_semaine: form.type_recurrence === 'quotidien' ? [] : form.jours_semaine,
          delivery_slot_id: form.delivery_slot_id || null,
          note: form.note || null,
          is_active: form.is_active,
        })
        .eq('id', id);

      if (updateError) throw updateError;

      // 2. Mettre à jour les articles (supprimer puis réinsérer)
      await supabase.from('recurring_order_items').delete().eq('recurring_order_id', id);

      if (lines.length > 0) {
        const { error: itemsError } = await supabase.from('recurring_order_items').insert(
          lines.map(l => ({
            recurring_order_id: id,
            product_article_id: l.product_id,
            product_nom: l.product_nom,
            quantite: l.quantite,
            note: l.note || null,
          }))
        );
        if (itemsError) throw itemsError;
      }

      router.push('/recurrences');
      router.refresh();
    } catch (error: any) {
      console.error('Erreur:', error);
      alert(`Erreur: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      const { error } = await supabase.from('recurring_orders').delete().eq('id', id);
      if (error) throw error;
      router.push('/recurrences');
      router.refresh();
    } catch (error: any) {
      console.error('Erreur:', error);
      alert(`Erreur: ${error?.message || JSON.stringify(error)}`);
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/recurrences" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Modifier la récurrence</h1>
            <p className="text-gray-500 mt-1">{form.nom || 'Sans libellé'}</p>
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

      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-600 mt-0.5 shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-medium text-red-900">Confirmer la suppression ?</p>
            <p className="text-sm text-red-700 mt-1">Les commandes déjà générées ne seront pas supprimées.</p>
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client, libellé, créneau, statut */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Client</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Client *</label>
              <select
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                required
              >
                <option value="">Sélectionner un client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Libellé <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder="Ex: Pains journaliers..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Créneau de livraison</label>
            <select
              value={form.delivery_slot_id}
              onChange={(e) => setForm({ ...form, delivery_slot_id: e.target.value })}
              className="w-full sm:w-72 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">Sans créneau</option>
              {deliverySlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.name} ({slot.start_time.slice(0, 5)})
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
            />
            <div>
              <span className="font-medium text-gray-700">Récurrence active</span>
              <p className="text-sm text-gray-500">Le job nocturne activera les commandes chaque soir</p>
            </div>
          </label>
        </div>

        {/* Fréquence */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Fréquence</h2>
          <div className="flex gap-3">
            {[
              { value: 'quotidien', label: 'Tous les jours' },
              { value: 'hebdo', label: 'Certains jours' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, type_recurrence: opt.value as any })}
                className={`px-5 py-2.5 rounded-xl font-medium transition-colors ${
                  form.type_recurrence === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {form.type_recurrence === 'hebdo' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Jours de livraison *</label>
              <div className="flex flex-wrap gap-2">
                {JOURS_SEMAINE.map((jour) => (
                  <button
                    key={jour.value}
                    type="button"
                    onClick={() => toggleJour(jour.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      form.jours_semaine.includes(jour.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {jour.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Articles */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Articles *</h2>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher un article..."
              value={searchProduct}
              onChange={(e) => setSearchProduct(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {searchProduct && (
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {filteredArticles.slice(0, 15).map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => addArticle(article)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-left"
                >
                  <span className="font-medium text-gray-900">{article.display_name}</span>
                  <Plus size={18} className="text-blue-600 shrink-0" />
                </button>
              ))}
              {filteredArticles.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-500">Aucun article trouvé</div>
              )}
            </div>
          )}

          {lines.length > 0 && (
            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.id} className="p-4 bg-gray-50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-gray-900 flex-1">{line.product_nom}</p>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateLine(line.id, { quantite: Math.max(1, line.quantite - 1) })}
                      className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg hover:bg-gray-100 font-medium"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={line.quantite}
                      onChange={(e) => updateLine(line.id, { quantite: parseInt(e.target.value) || 1 })}
                      className="w-20 text-center px-2 py-1.5 border border-gray-200 rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => updateLine(line.id, { quantite: line.quantite + 1 })}
                      className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg hover:bg-gray-100 font-medium"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {lines.length === 0 && !searchProduct && (
            <p className="text-center text-gray-400 py-4">Recherchez un article pour l&apos;ajouter</p>
          )}
        </div>

        {/* Note */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Note interne</label>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Remarques, instructions spéciales..."
            rows={3}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/recurrences" className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={loading || !form.client_id || lines.length === 0}
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
