'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Phone, Mail, MapPin, MessageSquare, CheckCircle, XCircle, Clock, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface ProspectRequest {
  id: string;
  raison_sociale: string;
  nom_contact: string;
  telephone: string;
  email: string;
  adresse: string | null;
  ville: string | null;
  message: string | null;
  status: 'nouveau' | 'traite' | 'refuse';
  created_at: string;
}

const STATUS_CONFIG = {
  nouveau:  { label: 'Nouveau',  color: 'text-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-200',  icon: Clock },
  traite:   { label: 'Traité',   color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle },
  refuse:   { label: 'Refusé',   color: 'text-red-500',   bg: 'bg-red-50',   border: 'border-red-200',   icon: XCircle },
};

export default function DemandesPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ProspectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'tous' | ProspectRequest['status']>('tous');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRequests((data as ProspectRequest[]) || []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: ProspectRequest['status']) {
    await supabase.from('prospect_requests').update({ status }).eq('id', id);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  function handleCreateClient(req: ProspectRequest) {
    const params = new URLSearchParams({
      nom: req.raison_sociale,
      contact: req.nom_contact,
      telephone: req.telephone,
      email: req.email,
      adresse_livraison: req.adresse || '',
      ville: req.ville || '',
      type_client: 'entreprise',
    });
    router.push(`/clients/nouveau?${params.toString()}`);
  }

  const filtered = requests.filter(r => filterStatus === 'tous' || r.status === filterStatus);
  const nouveaux = requests.filter(r => r.status === 'nouveau').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/parametres" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Demandes d'accès
            {nouveaux > 0 && (
              <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full">{nouveaux}</span>
            )}
          </h1>
          <p className="text-gray-500 mt-1">{requests.length} demande{requests.length > 1 ? 's' : ''} au total</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'tous', label: `Toutes (${requests.length})` },
          { key: 'nouveau', label: `Nouvelles (${requests.filter(r => r.status === 'nouveau').length})` },
          { key: 'traite', label: `Traitées` },
          { key: 'refuse', label: `Refusées` },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filterStatus === f.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Building2 size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucune demande{filterStatus !== 'tous' ? ' dans cette catégorie' : ''}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(req => {
            const st = STATUS_CONFIG[req.status];
            const StatusIcon = st.icon;
            const date = new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            return (
              <div key={req.id} className={`bg-white rounded-2xl border p-5 space-y-4 ${req.status === 'nouveau' ? 'border-blue-200 shadow-sm' : 'border-gray-100'}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900">{req.raison_sociale}</p>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${st.color} ${st.bg} ${st.border}`}>
                        <StatusIcon size={11} /> {st.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{req.nom_contact} · {date}</p>
                  </div>
                </div>

                {/* Infos contact */}
                <div className="grid sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={14} className="text-gray-400 shrink-0" />
                    <a href={`tel:${req.telephone}`} className="hover:text-blue-600 transition-colors">{req.telephone}</a>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail size={14} className="text-gray-400 shrink-0" />
                    <a href={`mailto:${req.email}`} className="hover:text-blue-600 transition-colors truncate">{req.email}</a>
                  </div>
                  {(req.adresse || req.ville) && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 sm:col-span-2">
                      <MapPin size={14} className="text-gray-400 shrink-0" />
                      <span>{[req.adresse, req.ville].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {req.message && (
                    <div className="flex items-start gap-2 text-sm text-gray-600 sm:col-span-2">
                      <MessageSquare size={14} className="text-gray-400 shrink-0 mt-0.5" />
                      <span className="italic">{req.message}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-50">
                  {req.status !== 'traite' && (
                    <button
                      onClick={() => handleCreateClient(req)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      <UserPlus size={14} /> Créer le client
                    </button>
                  )}
                  {req.status === 'nouveau' && (
                    <>
                      <button onClick={() => updateStatus(req.id, 'traite')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-semibold rounded-xl hover:bg-green-100 border border-green-200 transition-colors">
                        <CheckCircle size={14} /> Marquer traité
                      </button>
                      <button onClick={() => updateStatus(req.id, 'refuse')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 border border-red-200 transition-colors">
                        <XCircle size={14} /> Refuser
                      </button>
                    </>
                  )}
                  {req.status !== 'nouveau' && (
                    <button onClick={() => updateStatus(req.id, 'nouveau')}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1">
                      Remettre en nouveau
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
