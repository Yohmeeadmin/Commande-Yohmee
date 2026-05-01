'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Play, Pause, Edit2, ArrowLeft, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { RecurringOrder, JOURS_SEMAINE } from '@/types';
import { formatDate } from '@/lib/utils';
import { usePermissions } from '@/lib/permissions';

interface PortalRecurrence {
  id: string;
  client_id: string;
  nom: string | null;
  days_of_week: string[];
  delivery_slot_id: string | null;
  items: any[];
  is_active: boolean;
  created_at: string;
  client?: { nom: string };
  _source: 'portail';
}

export default function RecurrencesPage() {
  const { can } = usePermissions();
  const [recurrences, setRecurrences] = useState<RecurringOrder[]>([]);
  const [portalRecurrences, setPortalRecurrences] = useState<PortalRecurrence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecurrences();
  }, []);

  async function loadRecurrences() {
    try {
      const [{ data: adminData }, { data: portalData }] = await Promise.all([
        supabase
          .from('recurring_orders')
          .select('*, client:clients(nom), items:recurring_order_items(id, quantite, product_nom, article:product_articles!product_article_id(display_name))')
          .order('created_at', { ascending: false }),
        supabase
          .from('portal_recurring_orders')
          .select('*, client:clients(nom)')
          .order('created_at', { ascending: false }),
      ]);
      setRecurrences(adminData || []);
      setPortalRecurrences((portalData || []).map((r: any) => ({ ...r, _source: 'portail' })));
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(recurrence: RecurringOrder) {
    try {
      const { error } = await supabase
        .from('recurring_orders')
        .update({ is_active: !recurrence.is_active })
        .eq('id', recurrence.id);
      if (error) throw error;
      setRecurrences(recurrences.map(r =>
        r.id === recurrence.id ? { ...r, is_active: !r.is_active } : r
      ));
    } catch (err: any) {
      alert(`Erreur : ${err?.message || 'impossible de modifier la récurrence'}`);
    }
  }

  async function togglePortalActive(r: PortalRecurrence) {
    await supabase.from('portal_recurring_orders').update({ is_active: !r.is_active }).eq('id', r.id);
    setPortalRecurrences(prev => prev.map(p => p.id === r.id ? { ...p, is_active: !p.is_active } : p));
  }

const getJoursDisplay = (jours: string[]) => {
    if (!jours || jours.length === 0) return '-';
    if (jours.length === 7) return 'Tous les jours';
    return jours.map(j => j.charAt(0).toUpperCase() + j.slice(1, 3)).join(', ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/commandes" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commandes récurrentes</h1>
            <p className="text-gray-500 mt-1">{recurrences.filter(r => r.is_active).length + portalRecurrences.filter(r => r.is_active).length} récurrences actives</p>
          </div>
        </div>
        {can('recurrences.create') && (
          <Link
            href="/recurrences/nouvelle"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nouvelle récurrence
          </Link>
        )}
      </div>


      {/* Récurrences portail */}
      {portalRecurrences.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <Globe size={14} /> Portail client ({portalRecurrences.length})
          </h2>
          {portalRecurrences.map(r => (
            <div key={r.id} className={`bg-white rounded-2xl border p-6 transition-all ${r.is_active ? 'border-blue-100' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${r.is_active ? 'bg-blue-50' : 'bg-gray-100'}`}>
                    <Globe className={r.is_active ? 'text-blue-600' : 'text-gray-400'} size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{r.client?.nom || 'Client inconnu'}</h3>
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">Portail</span>
                    </div>
                    {r.nom && <p className="text-sm text-gray-500">{r.nom}</p>}
                  </div>
                </div>
                <button
                  onClick={() => togglePortalActive(r)}
                  className={`p-2 rounded-lg transition-colors ${r.is_active ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
                  title={r.is_active ? 'Suspendre' : 'Activer'}
                >
                  {r.is_active ? <Pause size={20} /> : <Play size={20} />}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Jours</p>
                  <p className="text-sm font-medium text-gray-700">{getJoursDisplay(r.days_of_week)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Articles</p>
                  <p className="text-sm font-medium text-gray-700">{r.items?.length || 0} ligne(s)</p>
                </div>
              </div>
              {r.items?.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">Produits ({r.items.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {r.items.slice(0, 5).map((item: any, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                        {item.quantity}x {item.display_name || item.article_id}
                      </span>
                    ))}
                    {r.items.length > 5 && <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">+{r.items.length - 5} autres</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Liste des récurrences admin */}
      {recurrences.length === 0 && portalRecurrences.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500">Aucune commande récurrente</p>
          <Link
            href="/recurrences/nouvelle"
            className="inline-flex items-center gap-2 mt-4 text-blue-600 font-medium"
          >
            <Plus size={18} /> Créer une récurrence
          </Link>
        </div>
      ) : recurrences.length > 0 ? (
        <div className="space-y-4">
          {portalRecurrences.length > 0 && (
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <RefreshCw size={14} /> Admin ({recurrences.length})
            </h2>
          )}
          {recurrences.map((recurrence) => (
            <div
              key={recurrence.id}
              className={`bg-white rounded-2xl border p-6 transition-all ${
                recurrence.is_active ? 'border-gray-100' : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    recurrence.is_active ? 'bg-green-50' : 'bg-gray-100'
                  }`}>
                    <RefreshCw className={recurrence.is_active ? 'text-green-600' : 'text-gray-400'} size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {(recurrence.client as any)?.nom || 'Client inconnu'}
                    </h3>
                    {recurrence.nom && (
                      <p className="text-sm text-gray-500">{recurrence.nom}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {can('recurrences.toggle') && (
                    <button
                      onClick={() => toggleActive(recurrence)}
                      className={`p-2 rounded-lg transition-colors ${
                        recurrence.is_active
                          ? 'text-orange-600 hover:bg-orange-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={recurrence.is_active ? 'Suspendre' : 'Activer'}
                    >
                      {recurrence.is_active ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                  )}
                  {can('recurrences.edit') && (
                    <Link
                      href={`/recurrences/${recurrence.id}`}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={20} />
                    </Link>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Jours</p>
                  <p className="text-sm font-medium text-gray-700">
                    {recurrence.type_recurrence === 'quotidien'
                      ? 'Tous les jours'
                      : getJoursDisplay(recurrence.jours_semaine)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Articles</p>
                  <p className="text-sm font-medium text-gray-700">
                    {(recurrence.items as any[])?.length || 0} ligne(s)
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Depuis</p>
                  <p className="text-sm font-medium text-gray-700">
                    {formatDate(recurrence.date_debut)}
                  </p>
                </div>
              </div>

              {/* Produits */}
              {(recurrence.items as any[])?.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">Produits ({(recurrence.items as any[]).length})</p>
                  <div className="flex flex-wrap gap-2">
                    {(recurrence.items as any[]).slice(0, 5).map((item: any) => (
                      <span
                        key={item.id}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full"
                      >
                        {item.quantite}x {item.article?.display_name || item.product_nom || 'Article'}
                      </span>
                    ))}
                    {(recurrence.items as any[]).length > 5 && (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">
                        +{(recurrence.items as any[]).length - 5} autres
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
