'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Users, Phone, Mail, MapPin, Building2, LayoutGrid, Table2, Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Client, CLIENT_TYPES } from '@/types';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'tableau'>('cards');

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .order('nom');

      setClients(data || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredClients = clients.filter(c => {
    const matchSearch = c.nom.toLowerCase().includes(search.toLowerCase()) ||
                       c.contact_nom?.toLowerCase().includes(search.toLowerCase()) ||
                       c.telephone?.includes(search);
    const matchType = selectedType === 'all' || c.type_client === selectedType;
    const matchActive = showInactive || c.is_active;
    return matchSearch && matchType && matchActive;
  });

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
                <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(client.type_client)}`}>
                  {getTypeLabel(client.type_client)}
                </span>
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
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Nom</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Type</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Téléphone</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Email</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Adresse livraison</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Jours</th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className={`hover:bg-gray-50 transition-colors ${!client.is_active ? 'opacity-60' : ''}`}
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
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">{client.adresse_livraison || '-'}</td>
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
