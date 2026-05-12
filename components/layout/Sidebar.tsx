'use client';

import { useState } from 'react';
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
  CalendarClock,
  FileText,
  ChevronLeft,
  ChevronRight,
  Settings,
  LogOut,
  RefreshCw,
  Warehouse,
  ChefHat,
  Wallet,
  Receipt,
  ShoppingBag,
  BookOpen,
} from 'lucide-react';
import Image from 'next/image';
import { useUser } from '@/contexts/UserContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAppSettings } from '@/lib/useAppSettings';
import { AppModule } from '@/types/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

type Icon = React.ComponentType<{ size?: number; className?: string }>;

interface NavItem {
  type: 'item';
  name: string;
  href: string;
  icon: Icon;
  module: AppModule;
}

interface NavGroup {
  type: 'group';
  label: string;
  icon: Icon;
  items: Omit<NavItem, 'type'>[];
}

type NavEntry = NavItem | NavGroup;

// ─── Structure de navigation ─────────────────────────────────────────────────

const NAV_STRUCTURE: NavEntry[] = [
  { type: 'item',  name: 'Dashboard',   href: '/',            icon: LayoutDashboard, module: 'dashboard' },

  { type: 'group', label: 'Vente', icon: ShoppingBag, items: [
    { name: 'Catalogue',    href: '/catalogue',   icon: Package,  module: 'catalogue' },
    { name: 'Clients',      href: '/clients',     icon: Users,    module: 'clients' },
    { name: 'Facturation',  href: '/facturation', icon: Receipt,  module: 'facturation' },
  ]},

  { type: 'group', label: 'Commandes', icon: ShoppingCart, items: [
    { name: 'Commandes',   href: '/commandes',   icon: ShoppingCart, module: 'commandes' },
    { name: 'Récurrentes', href: '/recurrences', icon: RefreshCw,    module: 'recurrences' },
    { name: 'Planning',    href: '/planning',    icon: Calendar,     module: 'planning' },
  ]},
  { type: 'item',  name: 'Livraisons',  href: '/livraisons',  icon: Truck,           module: 'livraisons' },
  { type: 'group', label: 'Production', icon: ClipboardList, items: [
    { name: 'Production',              href: '/production',                icon: ClipboardList, module: 'production' },
    { name: 'Planning',                href: '/production/planning',       icon: Calendar,      module: 'production' },
    { name: 'Fiche de prod',           href: '/production/fiche-de-prod',  icon: FileText,      module: 'production' },
    { name: 'Rétro-planning',          href: '/production/retro-planning', icon: CalendarClock, module: 'production' },
  ]},
  { type: 'item',  name: 'Stock',       href: '/stock',       icon: Warehouse,       module: 'stock' },
  { type: 'group', label: 'Recettes', icon: ChefHat, items: [
    { name: 'Fiches recettes',   href: '/recettes',                  icon: ChefHat,      module: 'recettes' },
{ name: 'Catalogue coûté',   href: '/recettes/catalogue-coute',  icon: BookOpen,     module: 'recettes' },
  ]},
  { type: 'item',  name: 'Charges',     href: '/charges',     icon: Wallet,          module: 'charges' },
  { type: 'item',  name: 'Paramètres',  href: '/parametres',  icon: Settings,        module: 'parametres' },
];

// ─── Composant ───────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useUser();
  const { collapsed, setCollapsed } = useSidebar();
  const { settings } = useAppSettings();

  const userModules = profile?.modules ?? [];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  // Détecte si un groupe contient la page active
  const groupIsActive = (group: NavGroup) =>
    group.items.some(i => isActive(i.href) && userModules.includes(i.module));

  // État open/closed pour chaque groupe — auto-ouverts si actif
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_STRUCTURE.forEach(entry => {
      if (entry.type === 'group') {
        initial[entry.label] = entry.items.some(i => pathname.startsWith(i.href));
      }
    });
    return initial;
  });

  function toggleGroup(label: string) {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : '';
  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : '?';

  return (
    <aside className={`
      fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50
      transition-all duration-300 ease-in-out flex flex-col
      ${collapsed ? 'w-20' : 'w-64'}
    `}>

      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 flex-shrink-0">
        {!collapsed && (
          settings.logo_url ? (
            <Image src={settings.logo_url} alt="Logo" width={200} height={64} className="h-14 w-auto object-contain" unoptimized />
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">{settings.company_name.charAt(0)}</span>
              </div>
              <div>
                <h1 className="font-bold text-gray-900">{settings.company_name}</h1>
                {settings.company_tagline && (
                  <p className="text-xs text-gray-500 truncate max-w-[120px]">{settings.company_tagline}</p>
                )}
              </div>
            </div>
          )
        )}
        {collapsed && (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto overflow-hidden">
            {settings.logo_url ? (
              <Image src={settings.logo_url} alt="Logo" width={40} height={40} className="w-full h-full object-contain" unoptimized />
            ) : (
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">{settings.company_name.charAt(0)}</span>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={20} className={`text-gray-400 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-3 flex-1 overflow-y-auto space-y-0.5">
        {NAV_STRUCTURE.map(entry => {

          // ── Item standalone ──────────────────────────────────────────────
          if (entry.type === 'item') {
            if (!userModules.includes(entry.module)) return null;
            const Icon = entry.icon;
            const active = isActive(entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                title={collapsed ? entry.name : undefined}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all
                  ${active ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <Icon size={22} className={active ? 'text-blue-600' : 'text-gray-400'} />
                {!collapsed && <span className="font-medium">{entry.name}</span>}
              </Link>
            );
          }

          // ── Groupe ───────────────────────────────────────────────────────
          if (entry.type === 'group') {
            const visibleItems = entry.items.filter(i => userModules.includes(i.module));
            if (visibleItems.length === 0) return null;

            const active = groupIsActive(entry);
            const open = openGroups[entry.label] ?? false;
            const GroupIcon = entry.icon;

            // En mode réduit : juste l'icône du groupe (cliquable vers 1er item)
            if (collapsed) {
              return (
                <div key={entry.label} className="relative group/grp">
                  <button
                    onClick={() => toggleGroup(entry.label)}
                    title={entry.label}
                    className={`w-full flex items-center justify-center px-3 py-2.5 rounded-xl transition-all
                      ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}
                    `}
                  >
                    <GroupIcon size={22} className={active ? 'text-blue-600' : 'text-gray-400'} />
                  </button>
                </div>
              );
            }

            // En mode étendu : header + items dépliables
            return (
              <div key={entry.label}>
                {/* Header groupe */}
                <button
                  onClick={() => toggleGroup(entry.label)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mt-1
                    ${active ? 'text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                >
                  <GroupIcon size={22} className={active ? 'text-blue-600' : 'text-gray-400'} />
                  <span className="font-semibold text-sm uppercase tracking-wide flex-1 text-left">
                    {entry.label}
                  </span>
                  <ChevronRight
                    size={16}
                    className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                  />
                </button>

                {/* Sous-menus */}
                {open && (
                  <div className="ml-3 mt-0.5 pl-3 border-l border-gray-100 space-y-0.5">
                    {visibleItems.map(item => {
                      const ItemIcon = item.icon;
                      const itemActive = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`
                            flex items-center gap-3 px-3 py-2 rounded-xl transition-all
                            ${itemActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                          `}
                        >
                          <ItemIcon size={18} className={itemActive ? 'text-blue-600' : 'text-gray-400'} />
                          <span className="font-medium text-sm">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </nav>

      {/* Utilisateur */}
      <div className="border-t border-gray-100 p-3 flex-shrink-0">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">{initials}</span>
            </div>
            <button onClick={signOut} title="Se déconnecter"
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
            <button onClick={signOut} title="Se déconnecter"
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
