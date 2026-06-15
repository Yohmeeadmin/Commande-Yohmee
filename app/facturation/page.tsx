'use client';

import { useEffect, useState } from 'react';
import { FileText, Receipt, CreditCard, RotateCcw, TrendingUp, Clock, CheckCircle, AlertCircle, Truck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatPrice, formatDate } from '@/lib/utils';
import DevisSection from '@/components/facturation/DevisSection';
import BonsLivraisonSection from '@/components/facturation/BonsLivraisonSection';
import FacturesSection from '@/components/facturation/FacturesSection';
import ReglementsSection from '@/components/facturation/ReglementsSection';
import AvoirsSection from '@/components/facturation/AvoirsSection';
import { ToastProvider } from '@/components/ui/Toast';

interface KPIs {
  ca_mois: number;
  en_attente: number;
  devis_en_cours: number;
  avoirs_disponibles: number;
}

interface RecentActivity {
  type: 'facture' | 'devis' | 'paiement' | 'avoir';
  reference: string;
  client_nom: string;
  montant: number;
  date: string;
  statut?: string;
}

type ActiveModule = 'devis' | 'bons-livraison' | 'factures' | 'reglements' | 'avoirs' | null;

const MODULES: {
  id: ActiveModule;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  activeColor: string;
  description: string;
}[] = [
  { id: 'devis', label: 'Devis', icon: FileText, color: 'bg-purple-50 text-purple-600', activeColor: 'bg-purple-600 text-white', description: 'Propositions commerciales' },
  { id: 'bons-livraison', label: 'Bons de livraison', icon: Truck, color: 'bg-teal-50 text-teal-600', activeColor: 'bg-teal-600 text-white', description: 'Édition et suivi des BL' },
  { id: 'factures', label: 'Factures', icon: Receipt, color: 'bg-blue-50 text-blue-600', activeColor: 'bg-blue-600 text-white', description: 'Facturation clients' },
  { id: 'reglements', label: 'Règlements', icon: CreditCard, color: 'bg-green-50 text-green-600', activeColor: 'bg-green-600 text-white', description: 'Suivi des paiements' },
  { id: 'avoirs', label: 'Avoirs', icon: RotateCcw, color: 'bg-orange-50 text-orange-600', activeColor: 'bg-orange-600 text-white', description: 'Notes de crédit' },
];

const MODULE_ICONS: Record<NonNullable<ActiveModule>, React.ComponentType<{ size?: number; className?: string }>> = {
  devis: FileText,
  'bons-livraison': Truck,
  factures: Receipt,
  reglements: CreditCard,
  avoirs: RotateCcw,
};

const MODULE_LABELS: Record<NonNullable<ActiveModule>, string> = {
  devis: 'Devis',
  'bons-livraison': 'Bons de livraison',
  factures: 'Factures',
  reglements: 'Règlements',
  avoirs: 'Avoirs',
};

const MODULE_HEADER_COLOR: Record<NonNullable<ActiveModule>, string> = {
  devis: 'bg-purple-50 text-purple-600',
  'bons-livraison': 'bg-teal-50 text-teal-600',
  factures: 'bg-blue-50 text-blue-600',
  reglements: 'bg-green-50 text-green-600',
  avoirs: 'bg-orange-50 text-orange-600',
};

export default function FacturationPage() {
  const [kpis, setKpis] = useState<KPIs>({ ca_mois: 0, en_attente: 0, devis_en_cours: 0, avoirs_disponibles: 0 });
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<ActiveModule>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [invoicesRes, devisRes, paymentsRes, avoirsRes] = await Promise.all([
      supabase.from('invoices').select('reference, statut, total_ttc, total_regle, date_emission, clients(nom)').order('date_emission', { ascending: false }).limit(20),
      supabase.from('devis').select('reference, statut, total_ttc, date_emission, clients(nom)').order('date_emission', { ascending: false }).limit(10),
      supabase.from('payments').select('reference, montant, date, clients(nom)').order('date', { ascending: false }).limit(5),
      supabase.from('credit_notes').select('reference, statut, montant, created_at, clients(nom)').eq('statut', 'emis'),
    ]);

    const invoices = invoicesRes.data ?? [];
    const devis = devisRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const avoirs = avoirsRes.data ?? [];

    const caMois = (invoices as any[])
      .filter((i: any) => i.date_emission >= firstOfMonth && i.statut !== 'annulee')
      .reduce((s: number, i: any) => s + (i.total_ttc ?? 0), 0);

    const enAttente = (invoices as any[])
      .filter((i: any) => ['emise', 'partiellement_reglee'].includes(i.statut))
      .reduce((s: number, i: any) => s + Math.max(0, (i.total_ttc ?? 0) - (i.total_regle ?? 0)), 0);

    const devisEnCours = devis.filter((d: any) => d.statut === 'envoye').length;
    const avoirsDispo = avoirs.reduce((s: number, a: any) => s + (a.montant ?? 0), 0);

    setKpis({ ca_mois: caMois, en_attente: enAttente, devis_en_cours: devisEnCours, avoirs_disponibles: avoirsDispo });

    const recentActivity: RecentActivity[] = [
      ...invoices.slice(0, 5).map((i: any) => ({
        type: 'facture' as const,
        reference: i.reference,
        client_nom: (i.clients as any)?.nom ?? '—',
        montant: i.total_ttc,
        date: i.date_emission,
        statut: i.statut,
      })),
      ...payments.slice(0, 3).map((p: any) => ({
        type: 'paiement' as const,
        reference: p.reference,
        client_nom: (p.clients as any)?.nom ?? '—',
        montant: p.montant,
        date: p.date,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

    setActivity(recentActivity);
    setLoading(false);
  }

  const STATUT_FACTURE: Record<string, { label: string; color: string }> = {
    brouillon: { label: 'Brouillon', color: 'text-gray-500' },
    emise: { label: 'Émise', color: 'text-blue-600' },
    partiellement_reglee: { label: 'Partiel', color: 'text-orange-500' },
    soldee: { label: 'Soldée', color: 'text-green-600' },
    annulee: { label: 'Annulée', color: 'text-red-500' },
  };

  return (
    <ToastProvider>
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900">Facturation</h1>
        <p className="text-gray-500 text-sm mt-1">Devis, factures, règlements, avoirs et rapports</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 text-gray-400 mb-3">
            <TrendingUp size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">CA du mois</span>
          </div>
          {loading ? <div className="h-7 bg-gray-100 rounded animate-pulse" /> : (
            <p className="text-2xl font-black text-gray-900">{formatPrice(kpis.ca_mois)}</p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 text-orange-400 mb-3">
            <Clock size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">En attente</span>
          </div>
          {loading ? <div className="h-7 bg-gray-100 rounded animate-pulse" /> : (
            <p className="text-2xl font-black text-orange-600">{formatPrice(kpis.en_attente)}</p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 text-purple-400 mb-3">
            <FileText size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Devis envoyés</span>
          </div>
          {loading ? <div className="h-7 bg-gray-100 rounded animate-pulse" /> : (
            <p className="text-2xl font-black text-purple-600">{kpis.devis_en_cours}</p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 text-green-400 mb-3">
            <CheckCircle size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Avoirs dispo.</span>
          </div>
          {loading ? <div className="h-7 bg-gray-100 rounded animate-pulse" /> : (
            <p className="text-2xl font-black text-green-600">{formatPrice(kpis.avoirs_disponibles)}</p>
          )}
        </div>
      </div>

      {/* Modules */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {MODULES.map(m => {
          const isActive = activeModule === m.id;
          return (
            <button key={m.id}
              onClick={() => setActiveModule(isActive ? null : m.id)}
              className={`rounded-2xl border p-5 text-left hover:shadow-md transition-all group relative ${
                isActive
                  ? `border-transparent shadow-md ${m.activeColor}`
                  : 'bg-white border-gray-100 hover:border-gray-200'
              }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${isActive ? 'bg-white/20' : m.color}`}>
                <m.icon size={20} className={isActive ? 'text-white' : ''} />
              </div>
              <p className={`font-bold ${isActive ? 'text-white' : 'text-gray-900'}`}>{m.label}</p>
              <p className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>{m.description}</p>
              {isActive && (
                <span className="absolute top-3 right-3 text-white/60 hover:text-white">
                  <X size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Section active ou Activité récente */}
      {activeModule ? (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${MODULE_HEADER_COLOR[activeModule]}`}>
                {(() => { const Icon = MODULE_ICONS[activeModule]; return <Icon size={14} />; })()}
              </div>
              <h2 className="font-bold text-gray-900">{MODULE_LABELS[activeModule]}</h2>
            </div>
            <button onClick={() => setActiveModule(null)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="p-5">
            {activeModule === 'devis' && <DevisSection />}
            {activeModule === 'bons-livraison' && <BonsLivraisonSection onNavigateToFactures={() => setActiveModule('factures')} />}
            {activeModule === 'factures' && <FacturesSection />}
            {activeModule === 'reglements' && <ReglementsSection />}
            {activeModule === 'avoirs' && <AvoirsSection />}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-bold text-gray-900">Activité récente</h2>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />)}
            </div>
          ) : activity.length === 0 ? (
            <div className="p-10 text-center">
              <AlertCircle size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Aucune activité</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {activity.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
                      ${item.type === 'facture' ? 'bg-blue-50 text-blue-600' :
                        item.type === 'paiement' ? 'bg-green-50 text-green-600' :
                        item.type === 'devis' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                      {item.type === 'facture' ? 'FA' : item.type === 'paiement' ? 'PA' : item.type === 'devis' ? 'DV' : 'AV'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.reference}</p>
                      <p className="text-xs text-gray-400">{item.client_nom}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-gray-900">{formatPrice(item.montant)}</p>
                    {item.statut && (
                      <p className={`text-xs font-medium ${STATUT_FACTURE[item.statut]?.color ?? 'text-gray-400'}`}>
                        {STATUT_FACTURE[item.statut]?.label}
                      </p>
                    )}
                    {!item.statut && <p className="text-xs text-gray-400">{formatDate(item.date)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </ToastProvider>
  );
}
