'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, AlertTriangle, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Alerts { pending: number; alertes: number; }

const TABS = [
  { href: '/achat',               label: 'Mercuriale',       exact: true },
  { href: '/achat/bons-commande', label: 'Bons de commande' },
  { href: '/achat/factures',      label: 'Factures fourn.' },
  { href: '/achat/fournisseurs',  label: 'Fournisseurs' },
  { href: '/achat/analyses',      label: 'Analyses' },
];

export default function AchatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<Alerts>({ pending: 0, alertes: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from('purchase_orders').select('id', { count: 'exact' }).eq('statut', 'en_attente'),
      supabase.from('stock_items').select('stock_actuel, stock_min'),
    ]).then(([{ count }, { data }]) => {
      const items = (data || []) as { stock_actuel: number | null; stock_min: number | null }[];
      setAlerts({
        pending: count ?? 0,
        alertes: items.filter(i => (i.stock_actuel ?? 0) <= (i.stock_min ?? 0)).length,
      });
    });
  }, [pathname]);

  return (
    <div className="-mx-4 -mt-4 lg:-mx-8 lg:-mt-8">
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 lg:px-8 pt-5 pb-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <ShoppingCart size={18} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-tight">Achat</p>
              <p className="text-xs text-gray-400 leading-tight hidden sm:block">Fournisseurs, commandes &amp; factures</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {alerts.pending > 0 && (
              <Link href="/achat/bons-commande" className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-600 hover:bg-orange-100 transition-colors">
                <ShoppingCart size={11} />
                {alerts.pending} BC en attente
              </Link>
            )}
            {alerts.alertes > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-xs font-bold text-red-600">
                <TrendingDown size={11} />
                {alerts.alertes} à commander
              </span>
            )}
          </div>
        </div>

        <nav
          className="px-4 lg:px-8 mt-4 overflow-x-auto"
          style={{ scrollbarWidth: 'none' } as React.CSSProperties}
        >
          <div className="flex min-w-max">
            {TABS.map(tab => {
              const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
              return (
                <Link key={tab.href} href={tab.href}
                  className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors
                    ${active
                      ? 'text-indigo-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-indigo-600 after:rounded-t-full'
                      : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="p-4 lg:p-8">
        {children}
      </div>
    </div>
  );
}
