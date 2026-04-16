'use client';

import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useUser } from '@/contexts/UserContext';
import { useAppSettings } from '@/lib/useAppSettings';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';

const PUBLIC_PATHS = ['/login', '/changer-mot-de-passe'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, profile } = useUser();

  const isPublicPage = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  if (isPublicPage) {
    return <div className="min-h-full">{children}</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <SidebarProvider>
      <AppLayout>{children}</AppLayout>
    </SidebarProvider>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { settings } = useAppSettings();
  return (
    <>
      {/* Sidebar desktop uniquement */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Navigation bas mobile uniquement */}
      <BottomNav />

      {/* Contenu principal */}
      <main className={`min-h-full transition-all duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Header mobile avec logo — safe-area-top pour les encoches iPhone */}
        <div
          className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100 px-4 flex items-center"
          style={{ minHeight: 56, paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-2.5">
            {settings.logo_url ? (
              <Image src={settings.logo_url} alt="Logo" width={120} height={36} className="h-8 w-auto object-contain" unoptimized />
            ) : (
              <>
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{settings.company_name.charAt(0)}</span>
                </div>
                <span className="font-bold text-gray-900">{settings.company_name}</span>
              </>
            )}
          </div>
        </div>

        {/* pb-20 = BottomNav 56px + safe-area-bottom iPhone */}
        <div className="p-4 pb-20 lg:p-8 lg:pb-8" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 64px, 80px)' }}>
          {children}
        </div>
      </main>
    </>
  );
}
