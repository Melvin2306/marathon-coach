"use client";

// The import UI shared by the Import page and plan setup: drop zone, result
// summary and per-provider export guides.
import { useId, useRef, useState } from "react";
import { importGuides, type Guide, type Yield } from "@/content/import-guides";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { formatDate, todayISO } from "@/lib/dates";
import { toRuns, type ImportSummary } from "@/lib/import/common";
import { ImportError, importFiles, type Provider } from "@/lib/import/importer";
import { addRuns, saveHealthMetrics } from "@/lib/store";
import type { Plan, RunSource } from "@/lib/types";
import { DateField } from "./date-field";
import { Card } from "./ui";

export interface ImportOutcome extends ImportSummary {
  providers: Provider[];
  /** runs per source, after the "since" filter */
  bySource: [RunSource, number][];
  found: number;
  /** runs before the "since" date */
  older: number;
  metricDays: number;
}

/**
 * Drop zone for any supported export: reads it in the browser, stores the
 * runs and daily health values, and reports what was found.
 */
export function ImportDropZone({
  plan,
  since,
  setSince,
  onResult,
  onError,
  bare = false,
}: {
  plan: Plan | null;
  /** runs before this ISO date are skipped */
  since: string;
  /** shows the "import runs since" field when given */
  setSince?: (v: string) => void;
  onResult: (r: ImportOutcome) => void;
  onError: (k: MessageKey) => void;
  /** without the surrounding card, e.g. inside another card */
  bare?: boolean;
}) {
  const { t } = useI18n();
  const inputId = useId();
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

  const content = (
    <>
      {progress === null ? (
        <label
          htmlFor={inputId}
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
      <input id={inputId} ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => upload([...(e.target.files ?? [])])} />

      {setSince && (
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor="import-since" className="font-medium">
            {t("import.since")}
          </label>
          <DateField id="import-since" className="w-full sm:w-64" value={since} max={todayISO()} onChange={setSince} />
          <span className="text-xs text-muted">{t("import.sinceHint")}</span>
        </div>
      )}
    </>
  );
  return bare ? content : <Card>{content}</Card>;
}

export function ImportResultCard({ result, since }: { result: ImportOutcome; since: string }) {
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

/** Step-by-step export instructions per provider. */
export function ImportGuides({ heading = true }: { heading?: boolean }) {
  const { t, locale } = useI18n();
  const guides = importGuides(locale);
  return (
    <section aria-labelledby={heading ? "guides-title" : undefined} aria-label={heading ? undefined : t("import.guides.title")} className="space-y-3">
      {heading && (
        <div>
          <h2 id="guides-title" className="text-xl font-semibold tracking-tight">
            {t("import.guides.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-2">{t("import.guides.subtitle")}</p>
        </div>
      )}
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
