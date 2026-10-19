"use client";

import { useEffect } from "react";

/** Registers public/sw.js in production, which keeps the app usable offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  }, []);
  return null;
}
