'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Calendar,
  Truck,
  ClipboardList,
  BarChart3,
  ChevronLeft,
  Settings,
  LogOut,
} from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { AppModule } from '@/types/auth';

const ALL_NAVIGATION: { name: string; href: string; icon: React.ComponentType<{ size?: number; className?: string }>; module: AppModule }[] = [
  { name: 'Dashboard',    href: '/',            icon: LayoutDashboard, module: 'dashboard' },
  { name: 'Catalogue',    href: '/catalogue',   icon: Package,         module: 'catalogue' },
  { name: 'Clients',      href: '/clients',     icon: Users,           module: 'clients' },
  { name: 'Commandes',    href: '/commandes',   icon: ShoppingCart,    module: 'commandes' },
  { name: 'Planning',     href: '/planning',    icon: Calendar,        module: 'planning' },
  { name: 'Livraisons',   href: '/livraisons',  icon: Truck,           module: 'livraisons' },
  { name: 'Production',   href: '/production',  icon: ClipboardList,   module: 'production' },
  { name: 'Rapports',     href: '/rapports',    icon: BarChart3,       module: 'rapports' },
  { name: 'Paramètres',   href: '/parametres',  icon: Settings,        module: 'parametres' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useUser();
  const { collapsed, setCollapsed } = useSidebar();

  const navigation = profile
    ? ALL_NAVIGATION.filter(item => profile.modules.includes(item.module))
    : [];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : '';
  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : '?';

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50
          transition-all duration-300 ease-in-out flex flex-col
          ${collapsed ? 'w-20' : 'w-64'}
          translate-x-0
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 flex-shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">B</span>
              </div>
              <div>
                <h1 className="font-bold text-gray-900">BDK</h1>
                <p className="text-xs text-gray-500">Commandes</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mx-auto">
              <span className="text-white font-bold text-lg">B</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft
              size={20}
              className={`text-gray-400 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all
                  ${active
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
                title={collapsed ? item.name : undefined}
              >
                <Icon size={22} className={active ? 'text-blue-600' : 'text-gray-400'} />
                {!collapsed && (
                  <span className="font-medium">{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Utilisateur connecté */}
        <div className="border-t border-gray-100 p-3 flex-shrink-0">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">{initials}</span>
              </div>
              <button
                onClick={signOut}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Se déconnecter"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xs">{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                title="Se déconnecter"
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
