import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/contexts/UserContext";
import AppShell from "@/components/layout/AppShell";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BDK Commandes",
  description: "Gestion des commandes BDK",
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
