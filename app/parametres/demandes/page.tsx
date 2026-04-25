'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Phone, Mail, MapPin, MessageSquare, CheckCircle, XCircle, Clock, UserPlus, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface DevisItem {
  article_id: string;
  display_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  vat_rate: number;
}

interface DevisRequest {
  id: string;
  raison_sociale: string;
  nom_contact: string;
  telephone: string;
  email: string;
  adresse: string | null;
  ville: string | null;
  message: string | null;
  items: DevisItem[];
  total_ht: number;
  status: 'nouveau' | 'traite' | 'refuse';
  created_at: string;
}

const STATUS_CONFIG = {
  nouveau:  { label: 'Nouveau',  color: 'text-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-200',  icon: Clock },
  traite:   { label: 'Traité',   color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle },
  refuse:   { label: 'Refusé',   color: 'text-red-500',   bg: 'bg-red-50',   border: 'border-red-200',   icon: XCircle },
};

function formatPrice(n: number) {
  return n.toFixed(2).replace('.', ',') + ' MAD';
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'prospects' | 'devis';

export default function DemandesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('devis');

  // Prospects
  const [prospects, setProspects] = useState<ProspectRequest[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [prospectsLoaded, setProspectsLoaded] = useState(false);
  const [filterProspect, setFilterProspect] = useState<'tous' | ProspectRequest['status']>('tous');

  // Devis
  const [devis, setDevis] = useState<DevisRequest[]>([]);
  const [devisLoading, setDevisLoading] = useState(false);
  const [devisLoaded, setDevisLoaded] = useState(false);
  const [filterDevis, setFilterDevis] = useState<'tous' | DevisRequest['status']>('tous');
  const [expandedDevis, setExpandedDevis] = useState<Set<string>>(new Set());

  useEffect(() => { loadDevis(); }, []);

  useEffect(() => {
    if (tab === 'prospects' && !prospectsLoaded) loadProspects();
    if (tab === 'devis' && !devisLoaded) loadDevis();
  }, [tab]);

  async function loadProspects() {
    setProspectsLoading(true);
    const { data } = await supabase.from('prospect_requests').select('*').order('created_at', { ascending: false });
    setProspects((data as ProspectRequest[]) || []);
    setProspectsLoaded(true);
    setProspectsLoading(false);
  }

  async function loadDevis() {
    setDevisLoading(true);
    const res = await fetch('/api/devis');
    if (res.ok) { const { requests } = await res.json(); setDevis(requests || []); }
    setDevisLoaded(true);
    setDevisLoading(false);
  }

  async function updateProspectStatus(id: string, status: ProspectRequest['status']) {
    await supabase.from('prospect_requests').update({ status }).eq('id', id);
    setProspects(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  async function updateDevisStatus(id: string, status: DevisRequest['status']) {
    await supabase.from('devis_requests').update({ status }).eq('id', id);
    setDevis(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  function handleCreateClientFromProspect(req: ProspectRequest) {
    const params = new URLSearchParams({
      nom: req.raison_sociale, contact: req.nom_contact, telephone: req.telephone,
      email: req.email, adresse_livraison: req.adresse || '', ville: req.ville || '',
      type_client: 'entreprise',
    });
    router.push(`/clients/nouveau?${params.toString()}`);
  }

  function handleCreateClientFromDevis(req: DevisRequest) {
    const params = new URLSearchParams({
      nom: req.raison_sociale, contact: req.nom_contact, telephone: req.telephone,
      email: req.email, adresse_livraison: req.adresse || '', ville: req.ville || '',
      type_client: 'entreprise',
    });
    router.push(`/clients/nouveau?${params.toString()}`);
  }

  function toggleExpand(id: string) {
    setExpandedDevis(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const nouveauxProspects = prospects.filter(r => r.status === 'nouveau').length;
  const nouveauxDevis = devis.filter(r => r.status === 'nouveau').length;
  const filteredProspects = prospects.filter(r => filterProspect === 'tous' || r.status === filterProspect);
  const filteredDevis = devis.filter(r => filterDevis === 'tous' || r.status === filterDevis);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/parametres" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandes</h1>
          <p className="text-gray-500 mt-1">Prospects et devis reçus depuis le site</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('devis')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === 'devis' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <ShoppingBag size={15} />
          Devis
          {nouveauxDevis > 0 && (
            <span className="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">{nouveauxDevis}</span>
          )}
        </button>
        <button
          onClick={() => setTab('prospects')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === 'prospects' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Building2 size={15} />
          Accès portail
          {nouveauxProspects > 0 && (
            <span className="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">{nouveauxProspects}</span>
          )}
        </button>
      </div>

      {/* ── ONGLET DEVIS ──────────────────────────────────────────────────── */}
      {tab === 'devis' && (
        <>
          {/* Filtres */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'tous', label: `Tous (${devis.length})` },
              { key: 'nouveau', label: `Nouveaux (${devis.filter(r => r.status === 'nouveau').length})` },
              { key: 'traite', label: 'Traités' },
              { key: 'refuse', label: 'Refusés' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilterDevis(f.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filterDevis === f.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {devisLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredDevis.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <ShoppingBag size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">Aucune demande de devis{filterDevis !== 'tous' ? ' dans cette catégorie' : ''}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDevis.map(req => {
                const st = STATUS_CONFIG[req.status];
                const StatusIcon = st.icon;
                const expanded = expandedDevis.has(req.id);
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
                        <p className="text-sm text-gray-500 mt-0.5">{req.nom_contact} · {formatDate(req.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Total HT</p>
                        <p className="font-bold text-gray-900">{formatPrice(req.total_ht)}</p>
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone size={14} className="text-gray-400 shrink-0" />
                        <a href={`tel:${req.telephone}`} className="hover:text-blue-600 transition-colors">{req.telephone}</a>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail size={14} className="text-gray-400 shrink-0" />
                        <a href={`mailto:${req.email}`} className="hover:text-blue-600 transition-colors truncate">{req.email}</a>
                      </div>
                      {req.ville && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
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

                    {/* Articles — collapsible */}
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleExpand(req.id)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700"
                      >
                        <span>{req.items.length} article{req.items.length > 1 ? 's' : ''} demandé{req.items.length > 1 ? 's' : ''}</span>
                        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      {expanded && (
                        <div className="divide-y divide-gray-50">
                          {req.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{item.display_name}</p>
                                <p className="text-xs text-gray-400">{formatPrice(item.unit_price)} / unité · TVA {item.vat_rate}%</p>
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                <p className="text-xs text-gray-500">×{item.quantity}</p>
                                <p className="text-sm font-semibold text-gray-900">{formatPrice(item.quantity * item.unit_price)}</p>
                              </div>
                            </div>
                          ))}
                          <div className="flex justify-between items-center px-4 py-3 bg-gray-50">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total HT</span>
                            <span className="font-bold text-gray-900">{formatPrice(req.total_ht)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-50">
                      {req.status !== 'traite' && (
                        <button onClick={() => handleCreateClientFromDevis(req)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                          <UserPlus size={14} /> Créer le client
                        </button>
                      )}
                      {req.status === 'nouveau' && (
                        <>
                          <button onClick={() => updateDevisStatus(req.id, 'traite')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-semibold rounded-xl hover:bg-green-100 border border-green-200 transition-colors">
                            <CheckCircle size={14} /> Marquer traité
                          </button>
                          <button onClick={() => updateDevisStatus(req.id, 'refuse')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 border border-red-200 transition-colors">
                            <XCircle size={14} /> Refuser
                          </button>
                        </>
                      )}
                      {req.status !== 'nouveau' && (
                        <button onClick={() => updateDevisStatus(req.id, 'nouveau')}
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
        </>
      )}

      {/* ── ONGLET PROSPECTS ──────────────────────────────────────────────── */}
      {tab === 'prospects' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'tous', label: `Toutes (${prospects.length})` },
              { key: 'nouveau', label: `Nouvelles (${prospects.filter(r => r.status === 'nouveau').length})` },
              { key: 'traite', label: 'Traitées' },
              { key: 'refuse', label: 'Refusées' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilterProspect(f.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filterProspect === f.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {prospectsLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredProspects.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Building2 size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">Aucune demande{filterProspect !== 'tous' ? ' dans cette catégorie' : ''}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProspects.map(req => {
                const st = STATUS_CONFIG[req.status];
                const StatusIcon = st.icon;
                return (
                  <div key={req.id} className={`bg-white rounded-2xl border p-5 space-y-4 ${req.status === 'nouveau' ? 'border-blue-200 shadow-sm' : 'border-gray-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900">{req.raison_sociale}</p>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${st.color} ${st.bg} ${st.border}`}>
                            <StatusIcon size={11} /> {st.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{req.nom_contact} · {formatDate(req.created_at)}</p>
                      </div>
                    </div>
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
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-50">
                      {req.status !== 'traite' && (
                        <button onClick={() => handleCreateClientFromProspect(req)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                          <UserPlus size={14} /> Créer le client
                        </button>
                      )}
                      {req.status === 'nouveau' && (
                        <>
                          <button onClick={() => updateProspectStatus(req.id, 'traite')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-semibold rounded-xl hover:bg-green-100 border border-green-200 transition-colors">
                            <CheckCircle size={14} /> Marquer traité
                          </button>
                          <button onClick={() => updateProspectStatus(req.id, 'refuse')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 border border-red-200 transition-colors">
                            <XCircle size={14} /> Refuser
                          </button>
                        </>
                      )}
                      {req.status !== 'nouveau' && (
                        <button onClick={() => updateProspectStatus(req.id, 'nouveau')}
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
        </>
      )}
    </div>
  );
}
