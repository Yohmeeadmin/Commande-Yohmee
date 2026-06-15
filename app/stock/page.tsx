'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Package, TrendingDown, AlertTriangle, Banknote,
  Receipt, ListOrdered, Flame, ClipboardCheck,
  ClipboardList, Plus, ChevronRight, Clock,
  ShoppingBag, ArrowLeftRight, Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockItem {
  id: string;
  nom: string;
  unite: string;
  stock_actuel: number;
  stock_min: number;
  prix_unitaire: number | null;
  item_type?: string;
  supplier?: { nom: string } | null;
}

interface Movement {
  id: string;
  type: string;
  quantite: number;
  date: string;
  created_at: string;
  note: string | null;
  utilisateur: string | null;
  stock_item?: { nom: string; unite: string } | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  entree_facture:    { label: 'Facture',     color: 'text-green-700',  bg: 'bg-green-50' },
  entree_production: { label: 'Production',  color: 'text-indigo-700', bg: 'bg-indigo-50' },
  sortie_economat:   { label: 'Économat',    color: 'text-orange-700', bg: 'bg-orange-50' },
  sortie_vente:      { label: 'Vente',       color: 'text-purple-700', bg: 'bg-purple-50' },
  inventaire:        { label: 'Inventaire',  color: 'text-blue-700',   bg: 'bg-blue-50' },
  perte:             { label: 'Perte',       color: 'text-red-700',    bg: 'bg-red-50' },
  reservation:       { label: 'Réservation', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  production:        { label: 'Production',  color: 'text-indigo-700', bg: 'bg-indigo-50' },
};

const QUICK_ACTIONS = [
  { label: 'Facture fournisseur', icon: Receipt,       href: '/stock/factures',     color: 'text-green-600',   bg: 'bg-green-50 hover:bg-green-100',   border: 'border-green-100' },
  { label: 'Bon de commande',     icon: ListOrdered,   href: '/stock/bons-commande', color: 'text-blue-600',    bg: 'bg-blue-50 hover:bg-blue-100',     border: 'border-blue-100' },
  { label: 'Demande économat',    icon: ClipboardList, href: '/stock/economat',      color: 'text-orange-600',  bg: 'bg-orange-50 hover:bg-orange-100', border: 'border-orange-100' },
  { label: 'Déclarer une perte',  icon: Flame,         href: '/stock/pertes',        color: 'text-red-600',     bg: 'bg-red-50 hover:bg-red-100',       border: 'border-red-100' },
  { label: 'Inventaire',          icon: ClipboardCheck,href: '/stock/inventaire',    color: 'text-indigo-600',  bg: 'bg-indigo-50 hover:bg-indigo-100', border: 'border-indigo-100' },
  { label: 'Mouvements',          icon: ArrowLeftRight,href: '/stock/mouvements',    color: 'text-gray-600',    bg: 'bg-gray-50 hover:bg-gray-100',     border: 'border-gray-100' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return 'À l\'instant';
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return `Il y a ${diffD}j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function fmtPrice(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' MAD';
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function StockDashboard() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: itemsData }, { data: mvtData }] = await Promise.all([
        supabase.from('stock_items').select('*, supplier:suppliers(nom)').order('nom'),
        supabase.from('stock_movements')
          .select('*, stock_item:stock_items(nom, unite)')
          .order('created_at', { ascending: false })
          .limit(12),
      ]);
      setItems((itemsData as StockItem[]) || []);
      setMovements((mvtData as Movement[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const mp        = useMemo(() => items.filter(i => !i.item_type || i.item_type === 'mp'), [items]);
  const pf        = useMemo(() => items.filter(i => i.item_type === 'pf'), [items]);
  const ruptures  = useMemo(() => mp.filter(i => (i.stock_actuel ?? 0) <= 0), [mp]);
  const alertes   = useMemo(() => mp.filter(i => (i.stock_actuel ?? 0) > 0 && (i.stock_actuel ?? 0) <= (i.stock_min ?? 0)), [mp]);

  const valeurMp = useMemo(() =>
    mp.reduce((s, i) => s + (i.stock_actuel ?? 0) * (i.prix_unitaire ?? 0), 0), [mp]);

  const alertItems = useMemo(() => [
    ...ruptures.map(i => ({ ...i, _status: 'rupture' as const })),
    ...alertes.map(i => ({ ...i, _status: 'alerte' as const })),
  ].slice(0, 12), [ruptures, alertes]);

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-gray-100 rounded-2xl" />
          <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  const totalAlerts = ruptures.length + alertes.length;

  return (
    <div className="space-y-6">

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Articles MP */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Package size={20} className="text-blue-600" />
            </div>
            <Link href="/stock/articles" className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
              Voir →
            </Link>
          </div>
          <p className="text-3xl font-black text-gray-900">{mp.length}</p>
          <p className="text-sm text-gray-500 mt-0.5 font-medium">Articles MP</p>
          <p className="text-xs text-gray-400 mt-1">{mp.filter(i => (i.stock_actuel ?? 0) > (i.stock_min ?? 0)).length} en stock normal</p>
        </div>

        {/* Ruptures */}
        <div className={`rounded-2xl border p-5 transition-colors ${ruptures.length > 0 ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ruptures.length > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
              <TrendingDown size={20} className={ruptures.length > 0 ? 'text-red-600' : 'text-gray-400'} />
            </div>
            {ruptures.length > 0 && (
              <Link href="/stock/bons-commande" className="text-xs text-red-600 hover:text-red-700 font-semibold transition-colors">
                Commander →
              </Link>
            )}
          </div>
          <p className={`text-3xl font-black ${ruptures.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{ruptures.length}</p>
          <p className={`text-sm mt-0.5 font-medium ${ruptures.length > 0 ? 'text-red-700' : 'text-gray-500'}`}>Ruptures</p>
          <p className={`text-xs mt-1 ${ruptures.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {ruptures.length > 0 ? 'Commande urgente !' : 'Aucune rupture'}
          </p>
        </div>

        {/* Alertes */}
        <div className={`rounded-2xl border p-5 transition-colors ${alertes.length > 0 ? 'bg-orange-50 border-orange-200 hover:border-orange-300' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${alertes.length > 0 ? 'bg-orange-100' : 'bg-gray-100'}`}>
              <AlertTriangle size={20} className={alertes.length > 0 ? 'text-orange-600' : 'text-gray-400'} />
            </div>
            {alertes.length > 0 && (
              <Link href="/stock/bons-commande" className="text-xs text-orange-600 hover:text-orange-700 font-semibold transition-colors">
                Commander →
              </Link>
            )}
          </div>
          <p className={`text-3xl font-black ${alertes.length > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{alertes.length}</p>
          <p className={`text-sm mt-0.5 font-medium ${alertes.length > 0 ? 'text-orange-700' : 'text-gray-500'}`}>Alertes stock</p>
          <p className={`text-xs mt-1 ${alertes.length > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
            {alertes.length > 0 ? 'Sous le seuil minimum' : 'Niveaux corrects'}
          </p>
        </div>

        {/* Valeur stock + PF */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Banknote size={20} className="text-emerald-600" />
            </div>
            <Link href="/stock/analyses" className="text-xs text-gray-400 hover:text-emerald-600 transition-colors">
              Analyses →
            </Link>
          </div>
          <p className="text-2xl font-black text-gray-900">{fmtPrice(valeurMp)}</p>
          <p className="text-sm text-gray-500 mt-0.5 font-medium">Valeur stock MP</p>
          <p className="text-xs text-gray-400 mt-1">{pf.length} produit{pf.length !== 1 ? 's' : ''} fini{pf.length !== 1 ? 's' : ''} suivi{pf.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* ── Contenu principal ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Articles à commander */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-gray-900">Articles à commander</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalAlerts > 0
                  ? `${ruptures.length} rupture${ruptures.length > 1 ? 's' : ''} · ${alertes.length} alerte${alertes.length > 1 ? 's' : ''}`
                  : 'Tous les niveaux sont satisfaisants'}
              </p>
            </div>
            {totalAlerts > 0 && (
              <Link
                href="/stock/bons-commande"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shrink-0"
              >
                <Plus size={12} /> Créer un BC
              </Link>
            )}
          </div>

          {alertItems.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Package size={24} className="text-green-500" />
              </div>
              <p className="font-semibold text-gray-700">Stock en ordre !</p>
              <p className="text-sm text-gray-400 mt-1">Aucun article en rupture ou sous le seuil minimum</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Article</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Fournisseur</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Stock actuel</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Seuil min.</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">État</th>
                      <th className="px-4 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {alertItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-900 text-sm">{item.nom}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">
                          {item.supplier?.nom ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold text-sm tabular-nums ${item._status === 'rupture' ? 'text-red-600' : 'text-orange-600'}`}>
                            {(item.stock_actuel ?? 0).toFixed(item.unite === 'kg' || item.unite === 'L' ? 1 : 0)} {item.unite}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className="text-sm text-gray-400 tabular-nums">
                            {(item.stock_min ?? 0)} {item.unite}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item._status === 'rupture' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700 uppercase tracking-wide">
                              <TrendingDown size={9} /> Rupture
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 uppercase tracking-wide">
                              <AlertTriangle size={9} /> Alerte
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href="/stock/bons-commande"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 inline-flex"
                            title="Créer un bon de commande"
                          >
                            <Plus size={13} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalAlerts > 12 && (
                <div className="px-5 py-3 border-t border-gray-50 text-center">
                  <Link href="/stock/articles" className="text-xs text-blue-600 hover:text-blue-700 font-semibold">
                    + {totalAlerts - 12} autres articles en alerte →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Activité récente */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between shrink-0">
            <div>
              <h2 className="font-bold text-gray-900">Activité récente</h2>
              <p className="text-xs text-gray-400 mt-0.5">Derniers mouvements de stock</p>
            </div>
            <Link href="/stock/mouvements" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold">
              Tout voir <ChevronRight size={13} />
            </Link>
          </div>

          {movements.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center px-5">
              <Clock size={28} className="text-gray-200 mb-2" />
              <p className="text-sm text-gray-400 font-medium">Aucun mouvement</p>
              <p className="text-xs text-gray-300 mt-1">L'historique apparaîtra ici</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {movements.map(mvt => {
                const t = TYPE_CFG[mvt.type] ?? { label: mvt.type, color: 'text-gray-600', bg: 'bg-gray-100' };
                const isPos = (mvt.quantite ?? 0) >= 0;
                return (
                  <div key={mvt.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {mvt.stock_item?.nom ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtRelativeDate(mvt.date || mvt.created_at)}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${t.bg} ${t.color}`}>
                      {t.label}
                    </span>
                    <span className={`text-sm font-bold shrink-0 tabular-nums ${isPos ? 'text-green-600' : 'text-red-500'}`}>
                      {isPos ? '+' : ''}{mvt.quantite} {mvt.stock_item?.unite ?? ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modules du stock ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Accès rapide</h2>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map(a => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border transition-all cursor-pointer ${a.bg} ${a.border}`}
              >
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
                  <Icon size={20} className={a.color} />
                </div>
                <span className={`text-xs font-semibold text-center leading-tight ${a.color}`}>{a.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Vue d'ensemble par famille ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* MP summary */}
        <Link href="/stock/articles" className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-blue-200 hover:shadow-sm transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <Package size={16} className="text-blue-600" />
              </div>
              <span className="font-semibold text-gray-900">Matières premières</span>
            </div>
            <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-black text-gray-900">{mp.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total</p>
            </div>
            <div>
              <p className={`text-2xl font-black ${ruptures.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{ruptures.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Ruptures</p>
            </div>
            <div>
              <p className={`text-2xl font-black ${alertes.length > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{alertes.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Alertes</p>
            </div>
          </div>
        </Link>

        {/* PF summary */}
        <Link href="/stock/produits-finis" className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-indigo-200 hover:shadow-sm transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                <ShoppingBag size={16} className="text-indigo-600" />
              </div>
              <span className="font-semibold text-gray-900">Produits finis</span>
            </div>
            <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-black text-gray-900">{pf.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total</p>
            </div>
            <div>
              <p className={`text-2xl font-black ${pf.filter(i => (i.stock_actuel ?? 0) <= 0).length > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                {pf.filter(i => (i.stock_actuel ?? 0) <= 0).length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Ruptures</p>
            </div>
            <div>
              <p className="text-2xl font-black text-blue-500">
                {pf.reduce((s, i) => s + ((i as any).quantite_reservee ?? 0), 0).toFixed(0)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Réservés</p>
            </div>
          </div>
        </Link>

        {/* Fournisseurs */}
        <Link href="/stock/fournisseurs" className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 hover:shadow-sm transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                <Building2 size={16} className="text-gray-500" />
              </div>
              <span className="font-semibold text-gray-900">Fournisseurs</span>
            </div>
            <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
          </div>
          <p className="text-xs text-gray-400">
            Gérez vos fournisseurs et leurs articles. Créez des bons de commande et suivez les réceptions.
          </p>
          <div className="flex gap-2 mt-3">
            <span className="text-[11px] px-2 py-1 bg-blue-50 text-blue-600 rounded-lg font-semibold">
              Bons de commande
            </span>
            <span className="text-[11px] px-2 py-1 bg-gray-50 text-gray-600 rounded-lg font-semibold">
              Factures
            </span>
          </div>
        </Link>
      </div>

    </div>
  );
}
