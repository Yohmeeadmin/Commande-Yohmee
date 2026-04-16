'use client';

import { useRef, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Eye, EyeOff, LogIn } from 'lucide-react';

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
    // Lecture via DOM direct (bypass autofill iOS)
    const emailEl = document.getElementById('email') as HTMLInputElement;
    const passEl = document.getElementById('password') as HTMLInputElement;
    const emailValue = (emailEl?.value || emailRef.current?.value || '').trim().toLowerCase();
    const passwordValue = passEl?.value || passwordRef.current?.value || '';

    alert(`Email: ${emailValue || '(vide)'}\nPass: ${passwordValue ? '***' : '(vide)'}`);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-start justify-center p-4 pt-16 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BDK Commandes</h1>
          <p className="text-gray-500 mt-1">Connexion à l'espace équipe</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                placeholder="votre@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              ref={btnRef}
              type="button"
              onClick={handleLogin}
              style={{
                background: loading ? '#93c5fd' : '#2563eb',
                borderRadius: 12,
                padding: '16px',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                color: 'white',
                fontWeight: 600,
                fontSize: 16,
                border: 'none',
                WebkitAppearance: 'none',
              }}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                <>
                  <LogIn size={20} />
                  Se connecter
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Accès réservé à l'équipe BDK
        </p>
      </div>
    </div>
  );
}
