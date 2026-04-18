'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Printer,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ChefHat,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Atelier, ProductionByAtelier } from '@/types';
import { useAteliers } from '@/lib/useAteliers';
import { formatDate, localDateStr } from '@/lib/utils';

interface ProductionItem {
  product_id: string;
  product_nom: string;
  reference: string | null;
  categorie: string;
  quantite_totale: number;
}

export default function ProductionAteliersPage() {
  const { ateliers, getStyle } = useAteliers();
  const [date, setDate] = useState(localDateStr());
  const [production, setProduction] = useState<ProductionByAtelier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAtelier, setSelectedAtelier] = useState<string>('all');

  useEffect(() => {
    loadProduction();
  }, [date]);

  async function loadProduction() {
    setLoading(true);
    try {
      // Récupérer les commandes confirmées ou en production pour cette date
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('date_livraison', date)
        .in('statut', ['confirmee', 'production']);

      if (!orders || orders.length === 0) {
        setProduction([]);
        setLoading(false);
        return;
      }

      const orderIds = orders.map((o: { id: string }) => o.id);

      // Récupérer les lignes de commande avec produits et atelier
      const { data: items } = await supabase
        .from('order_items')
        .select(`
          quantite,
          product_nom,
          product:products(id, nom, reference, atelier, category:categories(nom))
        `)
        .in('order_id', orderIds);

      if (!items) {
        setProduction([]);
        setLoading(false);
        return;
      }

      // Agréger par atelier puis par produit
      const atelierMap = new Map<Atelier, Map<string, ProductionItem>>();

      items.forEach((item: any) => {
        const atelier: Atelier = item.product?.atelier || 'autre';
        const productId = item.product?.id || 'unknown';
        const productNom = item.product?.nom || item.product_nom || 'Produit inconnu';
        const reference = item.product?.reference || null;
        const categorie = item.product?.category?.nom || 'Sans catégorie';

        if (!atelierMap.has(atelier)) {
          atelierMap.set(atelier, new Map());
        }

        const productMap = atelierMap.get(atelier)!;
        const existing = productMap.get(productId);

        if (existing) {
          existing.quantite_totale += item.quantite;
        } else {
          productMap.set(productId, {
            product_id: productId,
            product_nom: productNom,
            reference,
            categorie,
            quantite_totale: item.quantite,
          });
        }
      });

      // Convertir en tableau structuré
      const result: ProductionByAtelier[] = [];

      Array.from(atelierMap.entries()).forEach(([atelierValue, productMap]) => {
        if (productMap.size > 0) {
          const items = Array.from(productMap.values()).sort((a, b) =>
            a.product_nom.localeCompare(b.product_nom)
          );
          result.push({
            atelier: atelierValue,
            items,
            total_references: items.length,
            total_quantite: items.reduce((sum, i) => sum + i.quantite_totale, 0),
          });
        }
      });

      setProduction(result);
    } catch (error) {
      console.error('Erreur chargement production:', error);
    } finally {
      setLoading(false);
    }
  }

  const changeDate = (days: number) => {
    const newDate = new Date(date + 'T12:00:00');
    newDate.setDate(newDate.getDate() + days);
    setDate(localDateStr(newDate));
  };

  const goToToday = () => {
    setDate(localDateStr());
  };

  const getAtelierStyle = (atelier: string) => getStyle(atelier);

  const filteredProduction =
    selectedAtelier === 'all'
      ? production
      : production.filter((p) => p.atelier === selectedAtelier);

  const totalItems = filteredProduction.reduce((sum, p) => sum + p.total_quantite, 0);
  const totalRefs = filteredProduction.reduce((sum, p) => sum + p.total_references, 0);

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
          <Link
            href="/production"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors print:hidden"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Production par atelier</h1>
            <p className="text-gray-500 mt-1">
              {totalRefs} références, {totalItems} articles à produire
            </p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors print:hidden"
        >
          <Printer size={20} />
          Imprimer
        </button>
      </div>

      {/* Navigation date */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 print:hidden">
        <div className="flex items-center justify-between">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Aujourd&apos;hui
            </button>

            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-gray-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-lg font-semibold text-gray-900 border-none focus:outline-none focus:ring-0 bg-transparent"
              />
            </div>
          </div>

          <button
            onClick={() => changeDate(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {/* Filtres Atelier */}
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          onClick={() => setSelectedAtelier('all')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            selectedAtelier === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Tous les ateliers
        </button>
        {ateliers.map((atelier) => {
          const hasItems = production.some((p) => p.atelier === atelier.value);
          return (
            <button
              key={atelier.value}
              onClick={() => setSelectedAtelier(atelier.value)}
              disabled={!hasItems}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                selectedAtelier === atelier.value
                  ? 'ring-2 ring-offset-1'
                  : hasItems
                  ? 'hover:opacity-80'
                  : 'opacity-40 cursor-not-allowed'
              }`}
              style={{
                backgroundColor: atelier.bg_color,
                color: atelier.color,
                ...(selectedAtelier === atelier.value ? { ringColor: atelier.color } : {}),
              }}
            >
              {atelier.label}
            </button>
          );
        })}
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-8">
        <h1 className="text-2xl font-bold">Production par atelier - {formatDate(date)}</h1>
        <p className="text-gray-600">
          {totalRefs} références, {totalItems} articles à produire
        </p>
      </div>

      {/* Liste production par atelier */}
      {filteredProduction.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="text-gray-400" size={24} />
          </div>
          <p className="text-gray-500">Aucune production pour cette date</p>
          <p className="text-sm text-gray-400 mt-2">
            Les commandes confirmées ou en production apparaîtront ici
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredProduction.map((group) => {
            const atelierStyle = getAtelierStyle(group.atelier);
            return (
              <div
                key={group.atelier}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden print:break-inside-avoid"
              >
                {/* Header atelier */}
                <div
                  className="px-6 py-4 border-b flex items-center justify-between"
                  style={{ backgroundColor: atelierStyle.bgColor }}
                >
                  <div className="flex items-center gap-3">
                    <ChefHat size={24} style={{ color: atelierStyle.color }} />
                    <h2 className="text-lg font-bold" style={{ color: atelierStyle.color }}>
                      {atelierStyle.label}
                    </h2>
                  </div>
                  <div className="text-sm font-medium" style={{ color: atelierStyle.color }}>
                    {group.total_references} produits • {group.total_quantite} unités
                  </div>
                </div>

                {/* Liste produits */}
                <div className="divide-y divide-gray-50">
                  {group.items.map((item) => (
                    <div
                      key={item.product_id}
                      className="px-6 py-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: atelierStyle.bgColor }}
                        >
                          <span
                            className="text-lg font-bold"
                            style={{ color: atelierStyle.color }}
                          >
                            {item.quantite_totale}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{item.product_nom}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.reference && (
                              <span className="text-xs text-gray-400 font-mono">
                                {item.reference}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">{item.categorie}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 print:hidden">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded focus:ring-2"
                          style={{ accentColor: atelierStyle.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Résumé par atelier */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
            <h3 className="text-lg font-semibold mb-4">Résumé par atelier</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {production.map((group) => {
                const atelierStyle = getAtelierStyle(group.atelier);
                return (
                  <div key={group.atelier} className="bg-white/20 rounded-xl p-4">
                    <p className="text-sm text-white/80">{atelierStyle.label}</p>
                    <p className="text-2xl font-bold">{group.total_quantite}</p>
                    <p className="text-xs text-white/60">{group.total_references} produits</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .space-y-6,
          .space-y-6 * {
            visibility: visible;
          }
          .space-y-6 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
