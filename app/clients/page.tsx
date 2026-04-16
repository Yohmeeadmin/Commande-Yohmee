'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Users, Phone, Mail, MapPin, LayoutGrid, Table2, Edit2, AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Client, CLIENT_TYPES } from '@/types';
import { formatPrice } from '@/lib/utils';

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'tableau'>('cards');
  const [activeClientIds, setActiveClientIds] = useState<Set<string>>(new Set());
  const [riskClientIds, setRiskClientIds] = useState<Set<string>>(new Set());
  const [clientCA, setClientCA] = useState<Record<string, { current: number; previous: number }>>({});
  const [sortKey, setSortKey] = useState<string>('nom');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      const today = new Date();
      const date60 = new Date(today); date60.setDate(today.getDate() - 60);
      const date90 = new Date(today); date90.setDate(today.getDate() - 90);

      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

      const [{ data: clientsData }, { data: recentOrders }, { data: currentMonthOrders }, { data: prevMonthOrders }] = await Promise.all([
        supabase.from('clients').select('*').order('nom'),
        supabase
          .from('orders')
          .select('client_id, delivery_date')
          .not('status', 'eq', 'annulee')
          .gte('delivery_date', date90.toISOString().split('T')[0]),
        supabase
          .from('orders')
          .select('client_id, total')
          .not('status', 'eq', 'annulee')
          .gte('delivery_date', currentMonthStart),
        supabase
          .from('orders')
          .select('client_id, total')
          .not('status', 'eq', 'annulee')
          .gte('delivery_date', prevMonthStart)
          .lte('delivery_date', prevMonthEnd),
      ]);

      setClients(clientsData || []);

      // CA par client (mois en cours + mois précédent)
      const caMap: Record<string, { current: number; previous: number }> = {};
      for (const o of (currentMonthOrders || [])) {
        if (!o.client_id) continue;
        if (!caMap[o.client_id]) caMap[o.client_id] = { current: 0, previous: 0 };
        caMap[o.client_id].current += o.total || 0;
      }
      for (const o of (prevMonthOrders || [])) {
        if (!o.client_id) continue;
        if (!caMap[o.client_id]) caMap[o.client_id] = { current: 0, previous: 0 };
        caMap[o.client_id].previous += o.total || 0;
      }
      setClientCA(caMap);

      // Clients ayant commandé dans les 60 derniers jours → actifs
      // Clients ayant commandé entre 60 et 90 jours → à risque
      const activeSet = new Set<string>();
      const riskSet = new Set<string>();
      const date60Str = date60.toISOString().split('T')[0];

      for (const o of (recentOrders || [])) {
        if (!o.client_id) continue;
        if (o.delivery_date >= date60Str) {
          activeSet.add(o.client_id);
        } else {
          if (!activeSet.has(o.client_id)) riskSet.add(o.client_id);
        }
      }
      for (const id of activeSet) riskSet.delete(id);

      setActiveClientIds(activeSet);
      setRiskClientIds(riskSet);
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredClients = clients
    .filter(c => {
      const matchSearch = c.nom.toLowerCase().includes(search.toLowerCase()) ||
                         c.contact_nom?.toLowerCase().includes(search.toLowerCase()) ||
                         c.telephone?.includes(search);
      const matchType = selectedType === 'all' || c.type_client === selectedType;
      const matchActive = showInactive || c.is_active;
      return matchSearch && matchType && matchActive;
    })
    .sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';
      switch (sortKey) {
        case 'nom':      valA = a.nom.toLowerCase(); valB = b.nom.toLowerCase(); break;
        case 'type':     valA = a.type_client; valB = b.type_client; break;
        case 'telephone': valA = a.telephone || ''; valB = b.telephone || ''; break;
        case 'email':    valA = a.email || ''; valB = b.email || ''; break;
        case 'ville':    valA = a.ville || ''; valB = b.ville || ''; break;
        case 'ca':       valA = clientCA[a.id]?.current ?? 0; valB = clientCA[b.id]?.current ?? 0; break;
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ChevronsUpDown size={14} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="text-blue-500" />
      : <ChevronDown size={14} className="text-blue-500" />;
  }

  const getTypeLabel = (type: string) => {
    return CLIENT_TYPES.find(t => t.value === type)?.label || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      hotel: 'bg-purple-50 text-purple-700',
      restaurant: 'bg-orange-50 text-orange-700',
      cafe: 'bg-amber-50 text-amber-700',
      riad: 'bg-rose-50 text-rose-700',
      particulier: 'bg-blue-50 text-blue-700',
      autre: 'bg-gray-100 text-gray-700',
    };
    return colors[type] || colors.autre;
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-1">{filteredClients.length} clients</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
            title="Vue cartes"
          >
            <LayoutGrid size={20} />
          </button>
          <button
            onClick={() => setViewMode('tableau')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'tableau' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
            title="Vue tableau"
          >
            <Table2 size={20} />
          </button>
          <Link
            href="/clients/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nouveau client
          </Link>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Recherche */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher un client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Type */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="all">Tous les types</option>
            {CLIENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>

          {/* Toggle inactifs */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Voir inactifs</span>
          </label>
        </div>
      </div>

      {/* Liste des clients */}
      {filteredClients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500">Aucun client trouvé</p>
          <Link
            href="/clients/nouveau"
            className="inline-flex items-center gap-2 mt-4 text-blue-600 font-medium"
          >
            <Plus size={18} /> Créer un client
          </Link>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-md hover:border-blue-200 ${
                client.is_active ? 'border-gray-100' : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {client.nom.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(client.type_client)}`}>
                    {getTypeLabel(client.type_client)}
                  </span>
                  {client.note_interne?.startsWith('⚠️ À compléter') && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                      À compléter
                    </span>
                  )}
                  {client.is_active && riskClientIds.has(client.id) && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                      <AlertTriangle size={10} />
                      À risque
                    </span>
                  )}
                  {client.is_active && !activeClientIds.has(client.id) && !riskClientIds.has(client.id) && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      <AlertTriangle size={10} />
                      +90j inactif
                    </span>
                  )}
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{client.nom}</h3>
              {client.contact_nom && (
                <p className="text-sm text-gray-500 mb-3">{client.contact_nom}</p>
              )}

              <div className="space-y-2 pt-3 border-t border-gray-100">
                {client.telephone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={14} className="text-gray-400" />
                    {client.telephone}
                  </div>
                )}
                {client.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail size={14} className="text-gray-400" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.adresse_livraison && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={14} className="text-gray-400" />
                    <span className="truncate">{client.adresse_livraison}</span>
                  </div>
                )}
              </div>

              {client.jours_livraison && client.jours_livraison.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Jours de livraison</p>
                  <div className="flex flex-wrap gap-1">
                    {client.jours_livraison.map((jour) => (
                      <span
                        key={jour}
                        className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded"
                      >
                        {jour.charAt(0).toUpperCase() + jour.slice(1, 3)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    { key: 'nom', label: 'Nom', align: 'left' },
                    { key: 'type', label: 'Type', align: 'left' },
                    { key: 'telephone', label: 'Téléphone', align: 'left' },
                    { key: 'email', label: 'Email', align: 'left' },
                    { key: 'ville', label: 'Ville / Quartier', align: 'left' },
                    { key: 'jours', label: 'Jours', align: 'left', noSort: true },
                    { key: 'ca', label: 'CA (mois en cours)', align: 'right' },
                  ].map(col => (
                    <th key={col.key} className={`px-6 py-4 text-${col.align}`}>
                      {col.noSort ? (
                        <span className="text-sm font-medium text-gray-500">{col.label}</span>
                      ) : (
                        <button
                          onClick={() => handleSort(col.key)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                        >
                          {col.label}
                          <SortIcon col={col.key} />
                        </button>
                      )}
                    </th>
                  ))}
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => router.push(`/clients/${client.id}`)}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${!client.is_active ? 'opacity-60' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{client.nom.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{client.nom}</p>
                          {client.contact_nom && <p className="text-xs text-gray-500">{client.contact_nom}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(client.type_client)}`}>
                        {getTypeLabel(client.type_client)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.telephone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">{client.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {client.ville ? (
                        <div>
                          <p className="font-medium text-gray-800">{client.ville}</p>
                          {client.quartier && <p className="text-xs text-gray-400">{client.quartier}</p>}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {client.jours_livraison && client.jours_livraison.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {client.jours_livraison.map((jour) => (
                            <span key={jour} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                              {jour.charAt(0).toUpperCase() + jour.slice(1, 3)}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(() => {
                        const ca = clientCA[client.id];
                        const current = ca?.current ?? 0;
                        const previous = ca?.previous ?? 0;
                        const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
                        return (
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-semibold text-gray-900">{current > 0 ? formatPrice(current) : '—'}</span>
                            {current > 0 && pct !== null && (
                              <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full ${
                                pct > 0 ? 'bg-green-50 text-green-700' :
                                pct < 0 ? 'bg-red-50 text-red-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {pct > 0 ? <TrendingUp size={11} /> : pct < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                                {pct > 0 ? '+' : ''}{pct}%
                              </span>
                            )}
                            {current > 0 && pct === null && previous === 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                                <TrendingUp size={11} /> Nouveau
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/clients/${client.id}`}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex"
                      >
                        <Edit2 size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
