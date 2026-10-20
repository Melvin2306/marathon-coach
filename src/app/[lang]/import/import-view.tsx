"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { importGuides, type Guide, type Yield } from "@/content/import-guides";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { toRuns, type ImportSummary } from "@/lib/import/common";
import { ImportError, importFiles, type Provider } from "@/lib/import/importer";
import { addRuns, saveHealthMetrics, useAppData, usePlan } from "@/lib/store";
import { fetchStravaStatus, syncStrava, type StravaStatus } from "@/lib/strava/client";
import type { Plan, RunSource } from "@/lib/types";
import { STRAVA_SYNC } from "@/lib/site";
import { DateField } from "@/components/date-field";
import { Card, Skeleton } from "@/components/ui";

interface Result extends ImportSummary {
  providers: Provider[];
  /** runs per source, after the "since" filter */
  bySource: [RunSource, number][];
  found: number;
  /** runs before the "since" date */
  older: number;
  metricDays: number;
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
  const { t } = useI18n();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("import.title")}</h1>
        <p className="mt-1 text-ink-2">{t("import.subtitle")}</p>
      </div>

      <UploadCard
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

      {result && <ResultCard result={result} since={since} />}
      {error && (
        <div role="alert" className="rounded-2xl border border-warn/40 bg-surface p-4 text-sm font-medium text-warn">
          {t(error)}
        </div>
      )}

      <Guides />

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

function UploadCard({
  plan,
  since,
  setSince,
  onResult,
  onError,
}: {
  plan: Plan | null;
  since: string;
  setSince: (v: string) => void;
  onResult: (r: Result) => void;
  onError: (k: MessageKey) => void;
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    if (!files.length || progress !== null) return;
    setProgress(0);
    try {
      const imported = await importFiles(files, { since, onProgress: setProgress });
      saveHealthMetrics(imported.metrics);
      const runs = toRuns(imported.activities, plan, since);
      const summary = addRuns(runs);
      const bySource = new Map<RunSource, number>();
      for (const r of runs) bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
      onResult({
        ...summary,
        providers: imported.providers,
        bySource: [...bySource.entries()],
        found: runs.length,
        older: imported.activities.length - runs.length,
        metricDays: imported.metricDays,
      });
    } catch (e) {
      onError(e instanceof ImportError && e.reason === "unrecognized" ? "import.error.unrecognized" : "import.error.unreadable");
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      {progress === null ? (
        <label
          htmlFor="import-files"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload([...e.dataTransfer.files]);
          }}
          className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent/5" : "border-line hover:border-accent/60 hover:bg-surface-2/50"
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-8 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <span className="mt-3 font-medium">{t("import.drop.title")}</span>
          <span className="btn-primary mt-4">{t("import.drop.choose")}</span>
          <span className="mt-4 max-w-md text-sm text-ink-2">{t("import.drop.hint")}</span>
          <span className="mt-2 max-w-md text-xs text-muted">{t("import.drop.local")}</span>
        </label>
      ) : (
        <div className="py-8" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="flex justify-between text-sm text-ink-2">
            <span>{t("import.reading")}</span>
            <span className="tabular">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted">{t("import.readingHint")}</p>
        </div>
      )}
      {/* No accept filter: iOS greys out file types it doesn't know, such as .fit. */}
      <input id="import-files" ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => upload([...(e.target.files ?? [])])} />

      <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm sm:flex-row sm:items-center sm:gap-3">
        <label htmlFor="import-since" className="font-medium">
          {t("import.since")}
        </label>
        <DateField id="import-since" className="w-full sm:w-64" value={since} max={todayISO()} onChange={setSince} />
        <span className="text-xs text-muted">{t("import.sinceHint")}</span>
      </div>
    </Card>
  );
}

function ResultCard({ result, since }: { result: Result; since: string }) {
  const { t, tn, locale } = useI18n();
  const names = result.providers.map((p) => t(`source.${p}` as MessageKey)).join(", ");
  return (
    <div role="status" className="rounded-2xl border border-good/40 bg-surface p-4 text-sm">
      <div className="font-medium text-good">✓ {tn("import.result.runs", result.added)}</div>
      <p className="mt-1 text-ink-2">{t("import.result.recognised", { providers: names })}</p>
      {result.bySource.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {result.bySource.map(([source, n]) => (
            <li key={source} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
              {t(`source.${source}` as MessageKey)}: <span className="tabular font-medium">{n}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-ink-2">{t("import.result.none", { date: formatDate(since, { day: "numeric", month: "short", year: "numeric" }, locale) })}</p>
      )}
      {result.found + result.older > 0 && (
        <p className="mt-2 text-xs text-muted">{t("import.result.detail", { found: result.found, replaced: result.replaced, duplicates: result.duplicates, older: result.older })}</p>
      )}
      {result.metricDays > 0 && <p className="mt-1 text-xs text-muted">{t("import.result.metrics", { n: result.metricDays })}</p>}
    </div>
  );
}

const YIELD_STYLE: Record<Yield, string> = {
  curves: "bg-accent/10 text-accent",
  summaries: "bg-surface-2 text-ink-2",
  recovery: "bg-good/10 text-good",
};

function Guides() {
  const { t, locale } = useI18n();
  const guides = importGuides(locale);
  return (
    <section aria-labelledby="guides-title" className="space-y-3">
      <div>
        <h2 id="guides-title" className="text-xl font-semibold tracking-tight">
          {t("import.guides.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-2">{t("import.guides.subtitle")}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {guides.map((g) => (
          <GuideItem key={g.id} guide={g} />
        ))}
      </div>
      <p className="text-sm text-muted">{t("import.guides.other")}</p>
    </section>
  );
}

function GuideItem({ guide }: { guide: Guide }) {
  const { t } = useI18n();
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-surface-2/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{guide.name}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {t("import.guides.wait")}: {guide.wait}
          </span>
        </span>
        <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" fill="currentColor">
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </summary>
      <div className="px-4 pb-5">
        <ul className="flex flex-wrap gap-1.5">
          {guide.yields.map((y) => (
            <li key={y} className={`rounded-full px-2.5 py-1 text-xs font-medium ${YIELD_STYLE[y]}`}>
              {t(`import.yield.${y}`)}
            </li>
          ))}
        </ul>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-2 marker:text-muted">
          {guide.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {guide.tip && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{guide.tip}</p>}
        {guide.link && (
          <a href={guide.link.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block py-2 text-sm font-medium text-accent hover:underline">
            {guide.link.label} ↗
          </a>
        )}
      </div>
    </details>
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
