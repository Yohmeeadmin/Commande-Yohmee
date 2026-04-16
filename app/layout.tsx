import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/contexts/UserContext";
import AppShell from "@/components/layout/AppShell";

const inter = Inter({
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2563eb',
};

export const metadata: Metadata = {
  title: "BDK Commandes",
  description: "Gestion des commandes BDK",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BDK',
  },
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/logo-favicon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/logo-favicon.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.className} h-full`}>
      <body className="h-full bg-gray-50">
        <UserProvider>
          <AppShell>
            {children}
          </AppShell>
        </UserProvider>
      </body>
    </html>
  );
}
