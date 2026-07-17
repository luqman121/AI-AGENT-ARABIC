"use client";

import { useEffect } from "react";

/** Registers the restricted-cache service worker (see public/sw.js). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure only disables offline fallback; the app keeps working.
    });
  }, []);
  return null;
}
