'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Warehouse, TrendingDown, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Alerts { ruptures: number; alertes: number; }

const TABS = [
  { href: '/stock',                label: 'Tableau de bord', exact: true },
  { href: '/stock/articles',       label: 'Articles MP' },
  { href: '/stock/produits-finis', label: 'Produits finis' },
  { href: '/stock/economat',       label: 'Économat' },
  { href: '/stock/mouvements',     label: 'Mouvements' },
  { href: '/stock/pertes',         label: 'Pertes' },
  { href: '/stock/inventaire',     label: 'Inventaire' },
  { href: '/stock/analyses',       label: 'Analyses' },
];

export default function StockLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<Alerts>({ ruptures: 0, alertes: 0 });

  useEffect(() => {
    supabase.from('stock_items').select('stock_actuel, stock_min').then(({ data }) => {
      if (!data) return;
      setAlerts({
        ruptures: data.filter(i => (i.stock_actuel ?? 0) <= 0).length,
        alertes:  data.filter(i => (i.stock_actuel ?? 0) > 0 && (i.stock_actuel ?? 0) <= (i.stock_min ?? 0)).length,
      });
    });
  }, [pathname]);

  return (
    <div className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-8">

      {/* Module header */}
      <div className="bg-white border-b border-gray-200">

        <div className="px-4 lg:px-8 pt-5 pb-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <Warehouse size={18} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-tight">Stock</p>
              <p className="text-xs text-gray-400 leading-tight hidden sm:block">Gestion des stocks &amp; approvisionnements</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {alerts.ruptures > 0 && (
              <Link href="/stock" className="flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-600 hover:bg-red-100 transition-colors">
                <TrendingDown size={11} />
                {alerts.ruptures} rupture{alerts.ruptures > 1 ? 's' : ''}
              </Link>
            )}
            {alerts.alertes > 0 && (
              <Link href="/stock" className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-600 hover:bg-orange-100 transition-colors">
                <AlertTriangle size={11} />
                {alerts.alertes} alerte{alerts.alertes > 1 ? 's' : ''}
              </Link>
            )}
            {alerts.ruptures === 0 && alerts.alertes === 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-bold text-green-600">
                ✓ Stock OK
              </span>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <nav
          className="px-4 lg:px-8 mt-4 overflow-x-auto"
          style={{ scrollbarWidth: 'none' } as { scrollbarWidth: string }}
        >
          <div className="flex min-w-max">
            {TABS.map(tab => {
              const active = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`
                    relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors
                    ${active
                      ? 'text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600 after:rounded-t-full'
                      : 'text-gray-500 hover:text-gray-900'
                    }
                  `}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Page content */}
      <div className="p-4 lg:p-8">
        {children}
      </div>
    </div>
  );
}
