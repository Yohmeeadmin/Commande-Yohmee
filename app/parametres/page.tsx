'use client';

import Link from 'next/link';
import { Users, Truck, SlidersHorizontal, Building2, Globe, Tag } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function ParaemetresPage() {
  const { profile } = useUser();
  const [nouveauxCount, setNouveauxCount] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from('prospect_requests').select('id', { count: 'exact', head: true }).eq('status', 'nouveau'),
      supabase.from('devis_requests').select('id', { count: 'exact', head: true }).eq('status', 'nouveau'),
    ]).then(([{ count: c1 }, { count: c2 }]) => {
      setNouveauxCount((c1 ?? 0) + (c2 ?? 0));
    });
  }, []);

  if (profile?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500 mt-1">Administration de l'espace BDK</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/parametres/utilisateurs"
          className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-blue-200 transition-all"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
            <Users className="text-blue-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Utilisateurs</h3>
          <p className="text-sm text-gray-500">Gérer les comptes et les accès de l'équipe</p>
        </Link>

        <Link
          href="/parametres/reglages"
          className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-blue-200 transition-all"
        >
          <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4">
            <SlidersHorizontal className="text-purple-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Réglages</h3>
          <p className="text-sm text-gray-500">Logo, nom et personnalisation de l'app</p>
        </Link>

        <Link
          href="/parametres/chauffeurs"
          className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-blue-200 transition-all"
        >
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4">
            <Truck className="text-indigo-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Chauffeurs</h3>
          <p className="text-sm text-gray-500">Gérer les chauffeurs et leurs tournées</p>
        </Link>

        <Link
          href="/parametres/vitrine"
          className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-green-200 transition-all"
        >
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-4">
            <Globe className="text-green-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Catalogue en ligne</h3>
          <p className="text-sm text-gray-500">Gérer les produits affichés sur la vitrine publique</p>
        </Link>

        <Link
          href="/parametres/categories"
          className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-orange-200 transition-all"
        >
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mb-4">
            <Tag className="text-orange-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Catégories</h3>
          <p className="text-sm text-gray-500">Organiser les produits par catégorie et atelier</p>
        </Link>

        <Link
          href="/parametres/demandes"
          className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-amber-200 transition-all relative"
        >
          {nouveauxCount > 0 && (
            <span className="absolute top-4 right-4 w-6 h-6 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {nouveauxCount}
            </span>
          )}
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mb-4">
            <Building2 className="text-amber-500" size={24} />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Demandes d'accès</h3>
          <p className="text-sm text-gray-500">Prospects souhaitant ouvrir un compte client</p>
        </Link>
      </div>
    </div>
  );
}
