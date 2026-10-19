"use client";

import { useEffect, useRef } from "react";
import { fetchStravaStatus, syncStrava } from "@/lib/strava/client";
import { useAppData, usePlan } from "@/lib/store";

/** Keeps Strava runs current: syncs when the app opens and whenever the tab regains focus. */
export function StravaAutoSync() {
  const data = useAppData();
  const plan = usePlan(data)?.plan ?? null;
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const ready = data !== undefined;

  useEffect(() => {
    if (!ready) return;
    let connected: boolean | null = null;
    const sync = async () => {
      connected ??= (await fetchStravaStatus()).connected;
      if (connected) await syncStrava(planRef.current);
    };
    void sync();
    const onFocus = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [ready]);

  return null;
}
