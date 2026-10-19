"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { addDays, todayISO } from "@/lib/dates";
import { parseAppleHealthExport } from "@/lib/import/apple-health";
import { toRuns, type ImportSummary, type RawActivity } from "@/lib/import/common";
import { readText } from "@/lib/import/files";
import { parseStravaCsv } from "@/lib/import/strava-csv";
import { addRuns, saveHealthMetrics, useAppData, usePlan } from "@/lib/store";
import { fetchStravaStatus, syncStrava, type StravaStatus } from "@/lib/strava/client";
import type { Plan, RunSource } from "@/lib/types";
import { Card, Skeleton } from "@/components/ui";

interface Result {
  source: RunSource;
  found: number;
  added: number;
  replaced: number;
  duplicates: number;
  /** runs before the "since" date */
  older: number;
}


export function ImportView() {
  const data = useAppData();
  const plan = usePlan(data)?.plan ?? null;
  // A year of history gives the fitness estimate a reliable max heart rate and fills the progress charts.
  const [since, setSince] = useState(() => addDays(todayISO(), -365));
  if (!data) return <Skeleton />;
  return <Importer plan={plan} since={since} setSince={setSince} />;
}

function Importer({ plan, since, setSince }: { plan: Plan | null; since: string; setSince: (v: string) => void }) {
  const { t, tn } = useI18n();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  function apply(source: RunSource, activities: RawActivity[]) {
    const runs = toRuns(activities, plan, since);
    const summary = addRuns(runs);
    setError(null);
    setResult({ source, found: activities.length, older: activities.length - runs.length, ...summary });
  }

  const fail = (key: MessageKey) => {
    setResult(null);
    setError(key);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("import.title")}</h1>
        <p className="mt-1 text-ink-2">{t("import.subtitle")}</p>
        <p className="mt-2 text-sm text-muted">{t("import.priority")}</p>
      </div>

      <Card>
        <label className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">{t("import.since")}</span>
          <input type="date" className="field w-auto" value={since} max={todayISO()} onChange={(e) => e.target.value && setSince(e.target.value)} />
          <span className="text-xs text-muted">{t("import.sinceHint")}</span>
        </label>
      </Card>

      {result && (
        <div role="status" className="rounded-2xl border border-good/40 bg-surface p-4 text-sm">
          <div className="font-medium text-good">✓ {tn("import.result.title", result.added, { source: t(`source.${result.source}`) })}</div>
          <p className="mt-1 text-ink-2">
            {t("import.result.detail", { found: result.found, replaced: result.replaced, duplicates: result.duplicates, older: result.older })}
          </p>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-2xl border border-warn/40 bg-surface p-4 text-sm font-medium text-warn">
          {t(error)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <StravaCard
          plan={plan}
          onActivities={(a) => apply("strava", a)}
          onSynced={(found, summary) => {
            setError(null);
            setResult({ source: "strava", found, older: 0, ...summary });
          }}
          onError={fail}
        />
        <AppleHealthCard since={since} onActivities={(a) => apply("apple-health", a)} onError={fail} />
      </div>
    </div>
  );
}

function StravaCard({
  plan,
  onActivities,
  onSynced,
  onError,
}: {
  plan: Plan | null;
  onActivities: (a: RawActivity[]) => void;
  onSynced: (found: number, summary: ImportSummary) => void;
  onError: (k: MessageKey) => void;
}) {
  const { t, locale } = useI18n();
  const strava = useAppData()?.strava;
  const params = useSearchParams();
  const callback = params.get("strava");
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [busy, setBusy] = useState<"sync" | "file" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStravaStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);

  async function sync() {
    setBusy("sync");
    const result = await syncStrava(plan, { force: true });
    setBusy(null);
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

  async function upload(file: File) {
    setBusy("file");
    try {
      const text = await readText(file, (name) => /(^|\/)activities\.csv$/i.test(name), () => {});
      if (text === null) return onError("import.strava.noCsv");
      onActivities(parseStravaCsv(text).activities);
    } catch {
      onError("import.strava.badCsv");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const callbackMessage: Partial<Record<string, MessageKey>> = {
    connected: "import.strava.cb.connected",
    denied: "import.strava.cb.denied",
    error: "import.strava.cb.error",
    unconfigured: "import.strava.notConfigured",
  };

  return (
    <Card title="Strava">
      {callback && callbackMessage[callback] && <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{t(callbackMessage[callback]!)}</p>}

      <h3 className="text-sm font-medium">{t("import.strava.api")}</h3>
      {!status ? (
        <div className="mt-3 h-9 w-40 animate-pulse rounded-lg bg-surface-2" />
      ) : !status.configured ? (
        <p className="mt-2 text-sm text-ink-2">
          {t("import.strava.setup")} <code className="rounded bg-surface-2 px-1 text-xs">STRAVA_CLIENT_ID</code>,{" "}
          <code className="rounded bg-surface-2 px-1 text-xs">STRAVA_CLIENT_SECRET</code>
        </p>
      ) : status.connected ? (
        <div className="mt-2 space-y-3">
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
            <button className="btn-primary" onClick={sync} disabled={busy !== null}>
              {busy === "sync" ? t("import.working") : t("import.strava.sync")}
            </button>
            <button className="btn-ghost" onClick={disconnect} disabled={busy !== null}>
              {t("import.strava.disconnect")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-ink-2">{t("import.strava.connectHint")}</p>
          <a href={`/api/strava/connect?lang=${locale}`} className="btn text-white hover:brightness-110" style={{ background: "#fc4c02" }}>
            {t("import.strava.connect")}
          </a>
        </div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-sm font-medium">{t("import.strava.file")}</h3>
        <p className="mt-1 text-sm text-ink-2">{t("import.strava.fileHint")}</p>
        <button className="btn-ghost mt-3" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "file" ? t("import.working") : t("import.chooseFile")}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.zip,text/csv,application/zip" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
    </Card>
  );
}

function AppleHealthCard({ since, onActivities, onError }: { since: string; onActivities: (a: RawActivity[]) => void; onError: (k: MessageKey) => void }) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setProgress(0);
    try {
      const { workouts, metrics } = await parseAppleHealthExport(file, setProgress, since);
      saveHealthMetrics(metrics);
      onActivities(workouts);
    } catch (e) {
      onError(e instanceof Error && e.message === "no-export-xml" ? "import.health.noXml" : "import.health.bad");
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card title="Apple Health">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
        <li>{t("import.health.step1")}</li>
        <li>{t("import.health.step2")}</li>
        <li>{t("import.health.step3")}</li>
      </ol>
      <p className="mt-3 text-xs text-muted">{t("import.health.privacy")}</p>
      {progress === null ? (
        <button className="btn-ghost mt-4" onClick={() => fileRef.current?.click()}>
          {t("import.chooseFile")}
        </button>
      ) : (
        <div className="mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="flex justify-between text-xs text-ink-2">
            <span>{t("import.health.reading")}</span>
            <span className="tabular">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".zip,.xml,application/zip,text/xml" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </Card>
  );
}
