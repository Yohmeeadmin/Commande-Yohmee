'use client';

import { usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
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
        {/* Header mobile avec logo */}
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100 px-4 h-14 flex items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="font-bold text-gray-900">BDK Commandes</span>
          </div>
        </div>

        <div className="p-4 pb-28 lg:p-8 lg:pb-8">
          {children}
        </div>
      </main>
    </>
  );
}
