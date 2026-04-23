'use client';

import { useRef, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const handler = (e: TouchEvent) => {
      e.preventDefault();
      handleLogin();
    };
    btn.addEventListener('touchend', handler, { passive: false });
    return () => btn.removeEventListener('touchend', handler);
  }, []);

  async function handleLogin() {
    const emailEl = document.getElementById('email') as HTMLInputElement;
    const passEl = document.getElementById('password') as HTMLInputElement;
    const emailValue = (emailEl?.value || emailRef.current?.value || '').trim().toLowerCase();
    const passwordValue = passEl?.value || passwordRef.current?.value || '';

    if (!emailValue || !passwordValue) {
      setError('Champs vides — saisissez manuellement.');
      return;
    }

    setLoading(true);
    setError('Connexion…');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      });
      if (authError) {
        setError(`Erreur: ${authError.message}`);
        setLoading(false);
        return;
      }
      if (!data.session) {
        setError('Pas de session.');
        setLoading(false);
        return;
      }
      window.location.replace('/');
    } catch (err: any) {
      setError(`Exception: ${err?.message}`);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Header noir */}
      <header className="bg-white border-b border-black/10">
        <div className="w-full pl-4 pr-5 py-0 flex items-center justify-between" style={{ minHeight: 56 }}>
          <Image src="/bdk-noir.png" alt="BDK" width={220} height={80} className="h-20 w-auto object-contain" />
          <Link
            href="/accueil"
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black transition-colors"
          >
            <ArrowLeft size={13} /> Accueil
          </Link>
        </div>
      </header>

      {/* Formulaire centré */}
      <div className="flex-1 flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">

          {/* Titre */}
          <div className="mb-10">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-black/30 mb-3">
              Espace équipe
            </p>
            <h1 className="text-4xl font-black uppercase leading-none tracking-tighter text-black">
              Connexion
            </h1>
          </div>

          {/* Champs */}
          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">
                Email
              </label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="votre@email.com"
                className="w-full px-4 py-3.5 border border-black/20 text-sm focus:outline-none focus:border-black bg-white transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-widest text-black/40 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3.5 pr-12 border border-black/20 text-sm focus:outline-none focus:border-black bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-black/30 hover:text-black transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && error !== 'Connexion…' && (
              <p className="text-xs text-red-600 font-medium">{error}</p>
            )}

            <button
              ref={btnRef}
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-4 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Se connecter'
              )}
            </button>
          </div>

          <p className="text-xs text-black/30 text-center mt-8 uppercase tracking-widest">
            Accès réservé à l'équipe BDK
          </p>
        </div>
      </div>
    </div>
  );
}
