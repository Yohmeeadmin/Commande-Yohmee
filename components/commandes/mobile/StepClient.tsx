'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronRight, RefreshCw, Clock, RotateCcw, UserPlus, X } from 'lucide-react';
import { Client } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { HistoryOrder, OrderLine } from './types';
import { formatPrice } from '@/lib/utils';

interface Props {
  clients: Client[];
  selectedClient: Client | null;
  onSelect: (client: Client) => void;
  onReorder: (lines: OrderLine[]) => void;
  onNext: () => void;
  onClientAdded: (client: Client) => void;
}

export default function StepClient({ clients, selectedClient, onSelect, onReorder, onNext, onClientAdded }: Props) {
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ nom: '', telephone: '' });
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  async function handleQuickAdd() {
    if (!quickAddForm.nom.trim()) return;
    setQuickAddLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          nom: quickAddForm.nom.trim(),
          telephone: quickAddForm.telephone.trim() || null,
          type_client: 'autre',
          jours_livraison: [],
          is_active: true,
          note_interne: '⚠️ À compléter — créé rapidement depuis une commande',
        })
        .select()
        .single();
      if (error) throw error;
      onClientAdded(data as Client);
      onSelect(data as Client);
      setQuickAddOpen(false);
      setQuickAddForm({ nom: '', telephone: '' });
    } catch (err) {
      console.error('Erreur création client:', err);
    } finally {
      setQuickAddLoading(false);
    }
  }

  const filtered = useMemo(() =>
    clients.filter(c =>
      c.nom.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_nom ?? '').toLowerCase().includes(search.toLowerCase())
    ),
    [clients, search]
  );

  useEffect(() => {
    if (!selectedClient) { setHistory([]); return; }
    setLoadingHistory(true);
    supabase
      .from('orders')
      .select(`
        id, numero, delivery_date, total,
        items:order_items(
          product_article_id,
          quantity_ordered,
          unit_price,
          article_unit_quantity,
          product_article:product_articles(id, display_name)
        )
      `)
      .eq('client_id', selectedClient.id)
      .not('status', 'eq', 'annulee')
      .order('delivery_date', { ascending: false })
      .limit(5)
      .then(({ data }: { data: HistoryOrder[] | null }) => {
        setHistory(data || []);
        setLoadingHistory(false);
      });
  }, [selectedClient]);

  function handleReorder(order: HistoryOrder) {
    const lines: OrderLine[] = order.items
      .filter(i => i.product_article)
      .map(i => ({
        id: crypto.randomUUID(),
        article_id: i.product_article_id,
        article_display_name: i.product_article!.display_name,
        quantite: i.quantity_ordered,
        prix_unitaire: i.unit_price,
        unit_quantity: i.article_unit_quantity,
      }));
    onReorder(lines);
    onNext();
  }

  function formatDeliveryDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short',
    });
  }

  // Si un client est sélectionné → afficher son profil + historique
  if (selectedClient) {
    return (
      <div className="flex flex-col h-full">
        {/* Client sélectionné */}
        <div className="px-4 pt-2 pb-4">
          <div className="flex items-center justify-between bg-blue-50 rounded-2xl px-4 py-4">
            <div>
              <p className="text-xs text-blue-500 font-medium">Client sélectionné</p>
              <p className="font-bold text-blue-900 text-lg">{selectedClient.nom}</p>
              {selectedClient.telephone && (
                <p className="text-sm text-blue-600">{selectedClient.telephone}</p>
              )}
            </div>
            <button
              onClick={() => onSelect(null as unknown as Client)}
              className="text-xs text-blue-500 underline"
            >
              Changer
            </button>
          </div>
        </div>

        {/* Historique commandes */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Commandes récentes
          </p>

          {loadingHistory && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-gray-300" />
            </div>
          )}

          {!loadingHistory && history.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucun historique</p>
            </div>
          )}

          {history.map(order => (
            <div key={order.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              {/* En-tête order */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{order.numero}</p>
                  <p className="text-xs text-gray-400">{formatDeliveryDate(order.delivery_date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-gray-700">{formatPrice(order.total)}</p>
                  <button
                    onClick={() => handleReorder(order)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold active:scale-95 transition-transform"
                  >
                    <RotateCcw size={14} />
                    Recommander
                  </button>
                </div>
              </div>
              {/* Articles */}
              <div className="px-4 py-2.5 space-y-1">
                {order.items.slice(0, 4).map((item, i) => (
                  <p key={i} className="text-sm text-gray-600">
                    <span className="font-medium text-gray-800">×{item.quantity_ordered}</span>
                    {' '}{item.product_article?.display_name ?? '?'}
                  </p>
                ))}
                {order.items.length > 4 && (
                  <p className="text-xs text-gray-400">+{order.items.length - 4} autres articles</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bouton continuer */}
        <div className="flex-shrink-0 px-4 pb-6 pt-3 border-t border-gray-100">
          <button
            onClick={onNext}
            className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-bold text-base active:scale-98 transition-transform"
          >
            Parcourir le catalogue
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  // Sinon → liste clients
  return (
    <div className="flex flex-col h-full">
      {/* Recherche + bouton ajout rapide */}
      <div className="px-4 py-3 flex-shrink-0 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client…"
            autoFocus
            className="w-full pl-11 pr-4 py-3.5 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all text-base"
          />
        </div>
        <button
          onClick={() => setQuickAddOpen(true)}
          className="px-3.5 bg-blue-50 text-blue-600 rounded-2xl active:bg-blue-100 transition-colors"
          title="Ajouter un client rapidement"
        >
          <UserPlus size={20} />
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(client => (
          <button
            key={client.id}
            onClick={() => onSelect(client)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <div>
              <p className="font-semibold text-gray-900">{client.nom}</p>
              {client.contact_nom && (
                <p className="text-sm text-gray-400">{client.contact_nom}</p>
              )}
            </div>
            <ChevronRight size={18} className="text-gray-300" />
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">Aucun client trouvé</p>
            <button
              onClick={() => setQuickAddOpen(true)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
            >
              <UserPlus size={16} />
              Créer ce client
            </button>
          </div>
        )}
      </div>

      {/* Modale ajout rapide */}
      {quickAddOpen && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Nouveau client rapide</h3>
                <p className="text-xs text-gray-400 mt-0.5">À compléter plus tard dans Clients</p>
              </div>
              <button onClick={() => setQuickAddOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                autoFocus
                value={quickAddForm.nom}
                onChange={e => setQuickAddForm(f => ({ ...f, nom: e.target.value }))}
                placeholder="Nom / Société *"
                className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
              <input
                type="tel"
                value={quickAddForm.telephone}
                onChange={e => setQuickAddForm(f => ({ ...f, telephone: e.target.value }))}
                placeholder="Téléphone (optionnel)"
                className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
            </div>
            <button
              onClick={handleQuickAdd}
              disabled={!quickAddForm.nom.trim() || quickAddLoading}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-50 active:scale-98 transition-transform"
            >
              {quickAddLoading ? 'Création…' : 'Créer et sélectionner'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
