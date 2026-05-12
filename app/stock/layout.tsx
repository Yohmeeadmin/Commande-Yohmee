'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Warehouse, Users, FileText, ClipboardList, ScanLine, BarChart2, Layers, ShoppingCart } from 'lucide-react';

const TABS = [
  { label: 'Stock',        href: '/stock',                   icon: Warehouse },
  { label: 'Articles',     href: '/stock/articles',          icon: Layers },
  { label: 'Commandes',    href: '/stock/bons-commande',     icon: ShoppingCart },
  { label: 'Fournisseurs', href: '/stock/fournisseurs',      icon: Users },
  { label: 'Factures',     href: '/stock/factures',          icon: FileText },
  { label: 'Économat',     href: '/stock/economat',          icon: ClipboardList },
  { label: 'Inventaire',   href: '/stock/inventaire',        icon: ScanLine },
  { label: 'Analyses',     href: '/stock/analyses',          icon: BarChart2 },
];

export default function StockLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const activeTab = TABS.slice().reverse().find(t => pathname.startsWith(t.href))?.href ?? '/stock';

  return (
    <div className="space-y-0">
      {/* Sous-navigation */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none pb-1 mb-5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
