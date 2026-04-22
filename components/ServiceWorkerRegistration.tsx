'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Ne pas enregistrer le service worker en développement
    if (process.env.NODE_ENV !== 'production') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('SW registration failed:', err));
    }
  }, []);

  return null;
}
