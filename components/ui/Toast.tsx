'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastAPI {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

interface ToastContextValue {
  toast: ToastAPI;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `toast-${++counterRef.current}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast: ToastAPI = {
    success: (message) => addToast('success', message),
    error:   (message) => addToast('error', message),
    info:    (message) => addToast('info', message),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}

// ─── Toaster (affiché en bas à droite) ───────────────────────────────────────

const STYLES: Record<ToastType, { bg: string; border: string; icon: string; iconEl: React.ComponentType<{ size?: number; className?: string }> }> = {
  success: { bg: 'bg-green-600',  border: 'border-green-700', icon: 'text-green-100', iconEl: CheckCircle },
  error:   { bg: 'bg-red-600',    border: 'border-red-700',   icon: 'text-red-100',   iconEl: AlertCircle },
  info:    { bg: 'bg-blue-600',   border: 'border-blue-700',  icon: 'text-blue-100',  iconEl: Info },
};

function ToastCard({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const s = STYLES[t.type];
  const IconEl = s.iconEl;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl text-white border ${s.bg} ${s.border}
        transition-all duration-300 ease-out max-w-sm w-full
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <IconEl size={18} className={`shrink-0 mt-0.5 ${s.icon}`} />
      <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
      <button
        onClick={() => onDismiss(t.id)}
        className="shrink-0 p-0.5 hover:bg-white/20 rounded-lg transition-colors text-white/70 hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
