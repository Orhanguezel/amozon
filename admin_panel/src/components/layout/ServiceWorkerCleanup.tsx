'use client';

import { useEffect } from 'react';

export function ServiceWorkerCleanup() {
  useEffect(() => {
    if ('caches' in window) {
      void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    }

    if (!('serviceWorker' in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      let removed = false;
      for (const registration of registrations) {
        const scriptUrl = registration.active?.scriptURL || registration.installing?.scriptURL || '';
        if (scriptUrl.endsWith('/sw.js')) {
          void registration.unregister();
          removed = true;
        }
      }
      if (removed && navigator.serviceWorker.controller && sessionStorage.getItem('amozon-sw-cleaned') !== '1') {
        sessionStorage.setItem('amozon-sw-cleaned', '1');
        window.location.reload();
      }
    });
  }, []);

  return null;
}
