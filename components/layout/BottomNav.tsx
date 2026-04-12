'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Package, Users, ShoppingCart,
  Calendar, Truck, ClipboardList, BarChart3,
  Settings, LogOut, X, ChevronRight,
} from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { AppModule } from '@/types/auth';

const ALL_NAV: {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  module: AppModule;
}[] = [
  { name: 'Accueil',     href: '/',            icon: LayoutDashboard, module: 'dashboard' },
  { name: 'Commandes',   href: '/commandes',   icon: ShoppingCart,    module: 'commandes' },
  { name: 'Production',  href: '/production',  icon: ClipboardList,   module: 'production' },
  { name: 'Livraisons',  href: '/livraisons',  icon: Truck,           module: 'livraisons' },
  { name: 'Clients',     href: '/clients',     icon: Users,           module: 'clients' },
  { name: 'Catalogue',   href: '/catalogue',   icon: Package,         module: 'catalogue' },
  { name: 'Planning',    href: '/planning',    icon: Calendar,        module: 'planning' },
  { name: 'Rapports',    href: '/rapports',    icon: BarChart3,       module: 'rapports' },
  { name: 'Paramètres',  href: '/parametres',  icon: Settings,        module: 'parametres' },
];

const MAX_BOTTOM = 4; // nb d'items dans la barre (+ bouton Plus)

export default function BottomNav() {
  const pathname = usePathname();
  const { profile, signOut } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const navigation = profile
    ? ALL_NAV.filter(item => profile.modules.includes(item.module))
    : [];

  const bottomItems = navigation.slice(0, MAX_BOTTOM);
  const overflowItems = navigation.slice(MAX_BOTTOM);
  const hasMore = overflowItems.length > 0;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : '';
  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : '?';

  return (
    <>
      {/* Barre de navigation bas */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-pb">
        <div className="flex items-stretch">
          {bottomItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-h-[56px]
                  ${active ? 'text-blue-600' : 'text-gray-400'}`}
              >
                <Icon size={22} />
                <span className="text-[10px] font-medium leading-none">{item.name}</span>
              </Link>
            );
          })}

          {/* Bouton Plus */}
          {hasMore && (
            <button
              onClick={() => setMenuOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-h-[56px]
                ${menuOpen ? 'text-blue-600' : 'text-gray-400'}`}
            >
              <Settings size={22} />
              <span className="text-[10px] font-medium leading-none">Plus</span>
            </button>
          )}
        </div>
      </nav>

      {/* Menu "Plus" — slide-up */}
      {menuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-50"
            onClick={() => setMenuOpen(false)}
          />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl safe-area-pb">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Profil */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{initials}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{fullName}</p>
                  <p className="text-xs text-gray-400">{profile?.role}</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)}>
                <X size={22} className="text-gray-400" />
              </button>
            </div>

            {/* Items overflow */}
            <div className="py-2">
              {overflowItems.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors
                      ${active ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Icon size={22} className={active ? 'text-blue-600' : 'text-gray-400'} />
                    <span className="font-medium flex-1">{item.name}</span>
                    <ChevronRight size={16} className="text-gray-300" />
                  </Link>
                );
              })}
            </div>

            {/* Déconnexion */}
            <div className="border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="flex items-center gap-4 w-full text-red-500"
              >
                <LogOut size={22} />
                <span className="font-medium">Se déconnecter</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
