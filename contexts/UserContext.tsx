'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { UserProfile } from '@/types/auth';

interface UserContextType {
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

const PUBLIC_PATHS = ['/login', '/changer-mot-de-passe'];

// Cache module-level : le profil survit aux re-renders sans requête DB
let profileCache: UserProfile | null = null;

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(profileCache);
  const [loading, setLoading] = useState(!profileCache);
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  const loadProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    // Retourne le cache si le même user
    if (profileCache && profileCache.id === userId) return profileCache;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    profileCache = data as UserProfile;
    return profileCache;
  }, []);

  const signOut = useCallback(async () => {
    profileCache = null;
    await supabase.auth.signOut();
    setProfile(null);
    router.push('/login');
  }, [router]);

  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    profileCache = null; // Invalide le cache
    const prof = await loadProfile(session.user.id);
    if (prof) setProfile(prof);
  }, [loadProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_OUT') {
          profileCache = null;
          setProfile(null);
          setLoading(false);
          router.push('/login');
          return;
        }

        if (!session) {
          setProfile(null);
          setLoading(false);
          if (!isPublic) router.push('/login');
          return;
        }

        if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
          // INITIAL_SESSION avec cache → pas de requête DB
          if (event === 'INITIAL_SESSION' && profileCache?.id === session.user.id) {
            setProfile(profileCache);
            setLoading(false);
            return;
          }

          const prof = await loadProfile(session.user.id);

          if (!prof || !prof.is_active) {
            profileCache = null;
            setProfile(null);
            setLoading(false);
            await supabase.auth.signOut();
            return;
          }

          setProfile(prof);
          setLoading(false);

          if (prof.must_change_password) {
            if (!pathnameRef.current.startsWith('/changer-mot-de-passe')) {
              router.push('/changer-mot-de-passe');
            }
            // Ne pas tomber sur la redirection PUBLIC_PATHS — l'utilisateur doit remplir le formulaire
            return;
          }

          // Chauffeur lié → rediriger vers sa vue tournée
          if (prof.role === 'livraison' && prof.driver_id && !pathnameRef.current.startsWith('/chauffeur')) {
            router.push(`/chauffeur/${prof.driver_id}`);
            return;
          }

          if (PUBLIC_PATHS.some(p => pathnameRef.current.startsWith(p))) {
            router.push('/');
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <UserContext.Provider value={{ profile, loading, signOut, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
