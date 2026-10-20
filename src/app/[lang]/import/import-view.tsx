"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { addDays, todayISO } from "@/lib/dates";
import type { ImportSummary } from "@/lib/import/common";
import { useAppData, usePlan } from "@/lib/store";
import { fetchStravaStatus, syncStrava, type StravaStatus } from "@/lib/strava/client";
import type { Plan } from "@/lib/types";
import { STRAVA_SYNC } from "@/lib/site";
import { ImportDropZone, ImportGuides, ImportResultCard, type ImportOutcome } from "@/components/import-drop-zone";
import { Card, Skeleton } from "@/components/ui";


export function ImportView() {
  const data = useAppData();
  const plan = usePlan(data)?.plan ?? null;
  // A year of history gives the fitness estimate a reliable max heart rate and fills the progress charts.
  const [since, setSince] = useState(() => addDays(todayISO(), -365));
  if (!data) return <Skeleton />;
  return <Importer plan={plan} since={since} setSince={setSince} />;
}

function Importer({ plan, since, setSince }: { plan: Plan | null; since: string; setSince: (v: string) => void }) {
  const { t } = useI18n();
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("import.title")}</h1>
        <p className="mt-1 text-ink-2">{t("import.subtitle")}</p>
      </div>

      <ImportDropZone
        plan={plan}
        since={since}
        setSince={setSince}
        onResult={(r) => {
          setError(null);
          setResult(r);
        }}
        onError={(k) => {
          setResult(null);
          setError(k);
        }}
      />

      {result && <ImportResultCard result={result} since={since} />}
      {error && (
        <div role="alert" className="rounded-2xl border border-warn/40 bg-surface p-4 text-sm font-medium text-warn">
          {t(error)}
        </div>
      )}

      <ImportGuides />

      {STRAVA_SYNC && (
        <StravaSyncCard
          plan={plan}
          onSynced={(found, summary) => {
            setError(null);
            setResult({ ...summary, providers: ["strava"], bySource: [["strava", found]], found, older: 0, metricDays: 0 });
          }}
          onError={setError}
        />
      )}

      <p className="text-sm text-muted">{t("import.priority")}</p>
    </div>
  );
}

/** Account sync through the Strava API; only shown while STRAVA_SYNC is on. */
function StravaSyncCard({ plan, onSynced, onError }: { plan: Plan | null; onSynced: (found: number, summary: ImportSummary) => void; onError: (k: MessageKey) => void }) {
  const { t, locale } = useI18n();
  const strava = useAppData()?.strava;
  const params = useSearchParams();
  const callback = params.get("strava");
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStravaStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);

  async function sync() {
    setBusy(true);
    const result = await syncStrava(plan, { force: true });
    setBusy(false);
    if (result.ok) return onSynced(result.found, result.summary);
    if (result.error === "not-connected") {
      setStatus((s) => s && { ...s, connected: false });
      return onError("import.strava.expired");
    }
    if (result.error === "unavailable") onError("import.strava.unavailable");
  }

  async function disconnect() {
    await fetch("/api/strava/disconnect", { method: "POST" });
    setStatus((s) => s && { ...s, connected: false, athlete: null });
  }

  const callbackMessage: Partial<Record<string, MessageKey>> = {
    connected: "import.strava.cb.connected",
    denied: "import.strava.cb.denied",
    error: "import.strava.cb.error",
    unconfigured: "import.strava.notConfigured",
  };

  return (
    <Card title={t("import.strava.api")}>
      {callback && callbackMessage[callback] && <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{t(callbackMessage[callback]!)}</p>}
      {!status ? (
        <div className="h-9 w-40 animate-pulse rounded-lg bg-surface-2" />
      ) : !status.configured ? (
        <p className="text-sm text-ink-2">
          {t("import.strava.setup")} <code className="rounded bg-surface-2 px-1 text-xs">STRAVA_CLIENT_ID</code>,{" "}
          <code className="rounded bg-surface-2 px-1 text-xs">STRAVA_CLIENT_SECRET</code>
        </p>
      ) : status.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{status.athlete ? t("import.strava.connectedAs", { name: status.athlete }) : t("import.strava.connected")}</p>
          <p className="text-xs text-muted">
            {t("import.strava.auto")}
            {strava?.lastSync && ` ${t("import.strava.lastSync", { time: new Date(strava.lastSync).toLocaleString(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) })}`}
          </p>
          {strava?.athlete && !strava.athlete.profileAccess && (
            <p className="text-xs text-ink-2">
              {t("import.strava.needsProfile")}{" "}
              <a href={`/api/strava/connect?lang=${locale}`} className="font-medium text-accent hover:underline">
                {t("import.strava.reconnect")}
              </a>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={sync} disabled={busy}>
              {busy ? t("import.working") : t("import.strava.sync")}
            </button>
            <button className="btn-ghost" onClick={disconnect} disabled={busy}>
              {t("import.strava.disconnect")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{t("import.strava.connectHint")}</p>
          <a href={`/api/strava/connect?lang=${locale}`} className="btn text-white hover:brightness-110" style={{ background: "#fc4c02" }}>
            {t("import.strava.connect")}
          </a>
        </div>
      )}
    </Card>
  );
}
