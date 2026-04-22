'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  MoreHorizontal, X, ChevronRight,
  RefreshCw, Users, Package, BarChart3, Settings, LogOut,
} from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useAppSettings } from '@/lib/useAppSettings';
import { AppModule } from '@/types/auth';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';

const PUBLIC_PATHS = ['/login', '/changer-mot-de-passe', '/portail', '/accueil'];

// Items du menu "Plus" (tout ce qui n'est pas dans la barre du bas)
const OVERFLOW_NAV: {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  module: AppModule;
}[] = [
  { name: 'Récurrentes', href: '/recurrences', icon: RefreshCw, module: 'recurrences' },
  { name: 'Clients',     href: '/clients',     icon: Users,     module: 'clients' },
  { name: 'Catalogue',   href: '/catalogue',   icon: Package,   module: 'catalogue' },
  { name: 'Rapports',    href: '/rapports',    icon: BarChart3, module: 'rapports' },
  { name: 'Paramètres',  href: '/parametres',  icon: Settings,  module: 'parametres' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, profile } = useUser();

  const isPublicPage = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (!loading && !profile && !isPublicPage) {
      router.replace('/accueil');
    }
  }, [loading, profile, isPublicPage, router]);

  if (isPublicPage) return <div className="min-h-full">{children}</div>;

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppLayout>{children}</AppLayout>
    </SidebarProvider>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { settings } = useAppSettings();
  const { profile, signOut } = useUser();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const overflowItems = profile
    ? OVERFLOW_NAV.filter(item => profile.modules.includes(item.module))
    : [];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : '';
  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : '?';

  return (
    <>
      {/* Sidebar desktop uniquement */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Navigation bas mobile */}
      <BottomNav />

      {/* Contenu principal */}
      <main className={`min-h-full transition-all duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>

        {/* Header mobile — logo centré + bouton Plus */}
        <div
          className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center justify-between px-4" style={{ minHeight: 56 }}>
            {/* Espace gauche pour équilibrer */}
            <div className="w-10" />

            {/* Logo centré */}
            <div className="flex items-center justify-center">
              {settings.logo_url ? (
                <Image
                  src={settings.logo_url}
                  alt="Logo"
                  width={140}
                  height={40}
                  className="h-9 w-auto object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{settings.company_name.charAt(0)}</span>
                  </div>
                  <span className="font-bold text-gray-900 text-base">{settings.company_name}</span>
                </div>
              )}
            </div>

            {/* Bouton Plus */}
            <button
              onClick={() => setMenuOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 active:bg-gray-200"
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 pb-20 lg:p-8 lg:pb-8" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 64px, 80px)' }}>
          {children}
        </div>
      </main>

      {/* Menu Plus — slide-up */}
      {menuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-50"
            onClick={() => setMenuOpen(false)}
          />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl safe-area-pb animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Profil */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{initials}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{fullName}</p>
                  <p className="text-xs text-gray-400 capitalize">{profile?.role}</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100">
                <X size={18} className="text-gray-500" />
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
                    className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                      active ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={20} className={active ? 'text-blue-600' : 'text-gray-400'} />
                    <span className="font-medium flex-1">{item.name}</span>
                    <ChevronRight size={16} className="text-gray-300" />
                  </Link>
                );
              })}
            </div>

            {/* Déconnexion */}
            <div className="border-t border-gray-100 px-5 py-4 mb-2">
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="flex items-center gap-4 w-full text-red-500"
              >
                <LogOut size={20} />
                <span className="font-medium">Se déconnecter</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
