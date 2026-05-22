"use client";

import * as React from "react";

/**
 * Serwist is disabled in dev, but an older generated service worker can
 * remain installed and keep serving stale chunks/API responses. Clear it
 * locally so map code changes and route moves take effect immediately.
 */
export function ServiceWorkerCleanup() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });

    if ("caches" in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.includes("serwist") || key.includes("workbox") || key.includes("apis")) {
            void caches.delete(key);
          }
        }
      });
    }
  }, []);

  return null;
}
