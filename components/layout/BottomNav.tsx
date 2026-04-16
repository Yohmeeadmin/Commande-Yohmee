'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Truck, Calendar,
} from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { AppModule } from '@/types/auth';

const BOTTOM_NAV: {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  module: AppModule;
}[] = [
  { name: 'Accueil',    href: '/',           icon: LayoutDashboard, module: 'dashboard' },
  { name: 'Commandes',  href: '/commandes',  icon: ShoppingCart,    module: 'commandes' },
  { name: 'Production', href: '/production', icon: ClipboardList,   module: 'production' },
  { name: 'Livraisons', href: '/livraisons', icon: Truck,           module: 'livraisons' },
  { name: 'Planning',   href: '/planning',   icon: Calendar,        module: 'planning' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { profile } = useUser();

  const items = profile
    ? BOTTOM_NAV.filter(item => profile.modules.includes(item.module))
    : [];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-pb">
      <div className="flex items-stretch">
        {items.map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-h-[56px] ${
                active ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <Icon size={22} />
              <span className="text-[10px] font-medium leading-none">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
