"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { addDays, daysBetween, mondayOf, todayISO, weekday, weekdayName } from "@/lib/dates";
import { formatClock, formatDistance, parseClock, parseDecimal, unitLength } from "@/lib/format";
import { deriveFitness, type DerivedFitness } from "@/lib/fitness";
import { exportData, importData, loadDemo, readData, resetData, saveProfile, useAppData } from "@/lib/store";
import type { Experience, Profile, Run, RunSource, Units } from "@/lib/types";
import { HALF, MARATHON, predictTime, vdotFromRace } from "@/lib/vdot";
import { DateField } from "@/components/date-field";
import { ImportDropZone, ImportGuides, ImportResultCard, type ImportOutcome } from "@/components/import-drop-zone";
import { Card, Skeleton, Stat } from "@/components/ui";

export const RACE_DISTANCES: { label: MessageKey; meters: number }[] = [
  { label: "dist.5k", meters: 5000 },
  { label: "dist.10k", meters: 10000 },
  { label: "dist.half", meters: HALF },
  { label: "dist.marathon", meters: MARATHON },
];

interface FormState {
  name: string;
  raceName: string;
  raceDate: string;
  goalTime: string;
  raceDistance: string;
  raceTime: string;
  weeklyVolume: string;
  longestRun: string;
  daysPerWeek: string;
  longRunDay: string;
  experience: Experience;
  units: Units;
  /** ISO date the training plan starts */
  planStart: string;
}

function defaults(): FormState {
  const today = todayISO();
  // Roughly 11 months out, on a Sunday.
  const raceDate = addDays(mondayOf(addDays(today, 335)), 6);
  return {
    name: "",
    raceName: "",
    raceDate,
    goalTime: "",
    raceDistance: "10000",
    raceTime: "55:00",
    weeklyVolume: "25",
    longestRun: "12",
    daysPerWeek: "4",
    longRunDay: "6",
    experience: "first",
    units: "km",
    planStart: freshStart(today),
  };
}

function fromProfile(p: Profile): FormState {
  const u = unitLength(p.units);
  return {
    name: p.name,
    raceName: p.raceName,
    raceDate: p.raceDate,
    goalTime: p.goalTime ? formatClock(p.goalTime) : "",
    raceDistance: String(p.recentRace.distance),
    raceTime: formatClock(p.recentRace.time),
    weeklyVolume: String(Math.round(p.weeklyVolume / u)),
    longestRun: String(Math.round(p.longestRun / u)),
    daysPerWeek: String(p.daysPerWeek),
    longRunDay: String(p.longRunDay),
    experience: p.experience,
    units: p.units,
    planStart: p.planStart,
  };
}

/** A new plan starts today, or next Monday when set up on a weekend. */
function freshStart(today: string) {
  return weekday(today) >= 5 ? addDays(mondayOf(today), 7) : today;
}

export function SettingsForm() {
  const data = useAppData();
  if (!data) return <Skeleton />;
  // Remount the form when the stored profile changes (e.g. after an import).
  return <Form key={data.profile ? JSON.stringify(data.profile) : "new"} profile={data.profile} runs={data.runs} />;
}

function Form({ profile, runs }: { profile: Profile | null; runs: Run[] }) {
  const { t, tn, href, locale } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => (profile ? fromProfile(profile) : defaults()));
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportOutcome | null>(null);
  // The form stays editable while an import runs in the background. Submitting
  // meanwhile waits for it, so the plan is built from the imported runs.
  const formRef = useRef<HTMLFormElement>(null);
  const importing = useRef<{ running: boolean; ok: boolean; submitWhenDone: boolean }>({ running: false, ok: false, submitWhenDone: false });
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [waitingForImport, setWaitingForImport] = useState(false);

  function onImportBusy(progress: number | null) {
    importing.current.running = progress !== null;
    setImportProgress(progress);
    if (progress !== null || !importing.current.submitWhenDone) return;
    importing.current.submitWhenDone = false;
    setWaitingForImport(false);
    // After a failed import the runner sees the error first and decides.
    if (importing.current.ok) setTimeout(() => formRef.current?.requestSubmit());
  }
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const raceSeconds = parseClock(form.raceTime);
  const goalSeconds = form.goalTime.trim() ? parseClock(form.goalTime) : null;
  const vdot = raceSeconds ? vdotFromRace(Number(form.raceDistance), raceSeconds) : null;
  const weeksToRace = Math.floor(daysBetween(todayISO(), form.raceDate) / 7);
  const trainingWeeks = form.planStart && form.raceDate ? Math.floor(daysBetween(mondayOf(form.planStart), mondayOf(form.raceDate)) / 7) + 1 : 0;
  const fitness = deriveFitness(runs, form.planStart || freshStart(todayISO()), todayISO());
  const fitnessFromRuns = fitness.vdot !== null;
  const volumeFromRuns = fitness.weeklyVolume !== null;

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (importing.current.running) {
      importing.current.submitWhenDone = true;
      setWaitingForImport(true);
      return;
    }
    const today = todayISO();
    const u = unitLength(form.units);
    if (!fitnessFromRuns && (!raceSeconds || !vdot || vdot < 15 || vdot > 90)) return setError(t("settings.error.raceTime"));
    if (form.goalTime.trim() && !goalSeconds) return setError(t("settings.error.goalTime"));
    if (form.raceDate < today) return setError(t("settings.error.racePassed"));
    if (!form.planStart || daysBetween(form.planStart, form.raceDate) < 28) return setError(t("settings.error.tooSoon"));
    const planStart = form.planStart;
    saveProfile({
      name: form.name.trim(),
      raceName: form.raceName.trim(),
      raceDate: form.raceDate,
      planStart,
      goalTime: goalSeconds,
      // Kept as the fallback for when there are no recorded runs.
      recentRace: raceSeconds ? { distance: Number(form.raceDistance), time: raceSeconds } : (profile?.recentRace ?? { distance: 10000, time: 3300 }),
      weeklyVolume: Math.max(0, parseDecimal(form.weeklyVolume) || 0) * u,
      longestRun: Math.max(0, parseDecimal(form.longestRun) || 0) * u,
      daysPerWeek: Number(form.daysPerWeek) as Profile["daysPerWeek"],
      longRunDay: Number(form.longRunDay),
      experience: form.experience,
      units: form.units,
    });
    router.push(href("/"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{profile ? t("nav.settings") : t("settings.newTitle")}</h1>
        <p className="mt-1 text-ink-2">{t("settings.subtitle")}</p>
      </div>

      <form ref={formRef} onSubmit={submit} className="space-y-6">
        {/* Until there are recorded runs, offer them first: they answer the fitness questions below. */}
        {(!fitnessFromRuns || imported) && (
          <ImportFirst
            imported={imported}
            setImported={setImported}
            fitnessFromRuns={fitnessFromRuns}
            volumeFromRuns={volumeFromRuns}
            busy={importProgress !== null}
            onBusy={onImportBusy}
            onDone={(ok) => (importing.current.ok = ok)}
          />
        )}

        <Card title={t("settings.race")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.raceName")}>
              <input className="field" placeholder={t("settings.raceNamePlaceholder")} value={form.raceName} onChange={(e) => set("raceName", e.target.value)} />
            </Field>
            <div>
              <label htmlFor="race-date" className="mb-1.5 block text-sm font-medium">
                {t("settings.raceDate")}
              </label>
              <DateField
                id="race-date"
                value={form.raceDate}
                min={todayISO()}
                onChange={(iso) => {
                  set("raceDate", iso);
                  if (!profile) set("longRunDay", String(weekday(iso)));
                }}
              />
              {weeksToRace > 0 && <span className="mt-1 block text-xs text-muted">{tn("settings.weeksAway", weeksToRace)}</span>}
            </div>
            <div>
              <label htmlFor="plan-start" className="mb-1.5 block text-sm font-medium">
                {t("settings.planStart")}
              </label>
              <DateField id="plan-start" value={form.planStart} max={form.raceDate ? addDays(form.raceDate, -28) : undefined} onChange={(iso) => set("planStart", iso)} />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <button type="button" className="py-2 font-medium text-accent hover:underline md:py-0" onClick={() => set("planStart", todayISO())}>
                  {t("settings.startToday")}
                </button>
                <button type="button" className="py-2 font-medium text-accent hover:underline md:py-0" onClick={() => set("planStart", addDays(mondayOf(todayISO()), 7))}>
                  {t("settings.startMonday")}
                </button>
                {trainingWeeks > 0 && <span className="text-muted">{tn("settings.trainingWeeks", trainingWeeks)}</span>}
              </div>
              {form.planStart && form.planStart < todayISO() && <p className="mt-1 text-xs text-muted">{t("settings.startPast")}</p>}
            </div>
            <Field label={t("settings.goal")} hint={t("settings.goalHint")}>
              <input className="field tabular" placeholder="3:59:00" value={form.goalTime} onChange={(e) => set("goalTime", e.target.value)} />
            </Field>
            <Field label={t("settings.name")}>
              <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title={t("settings.fitness")}>
          {fitnessFromRuns && <RecordedFitness fitness={fitness} runs={runs} units={form.units} />}
          {(() => {
            const raceFields = (
              <>
                <Field label={t("settings.recentRace")}>
                  <select className="field" value={form.raceDistance} onChange={(e) => set("raceDistance", e.target.value)}>
                    {RACE_DISTANCES.map((d) => (
                      <option key={d.label} value={d.meters}>
                        {t(d.label)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t("settings.finishTime")}
                  hint={
                    vdot && vdot > 15 && vdot < 90
                      ? t("settings.vdotHint", { vdot: vdot.toFixed(1), time: formatClock(predictTime(vdot, MARATHON)) })
                      : t("settings.finishTimeHint")
                  }
                >
                  <input className="field tabular" required={!fitnessFromRuns} value={form.raceTime} onChange={(e) => set("raceTime", e.target.value)} />
                </Field>
              </>
            );
            const volumeFields = (
              <>
                <Field label={t("settings.weekly", { units: form.units })}>
                  <input inputMode="decimal" className="field tabular" value={form.weeklyVolume} onChange={(e) => set("weeklyVolume", e.target.value)} />
                </Field>
                <Field label={t("settings.longest", { units: form.units })}>
                  <input inputMode="decimal" className="field tabular" value={form.longestRun} onChange={(e) => set("longestRun", e.target.value)} />
                </Field>
              </>
            );
            return (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {!fitnessFromRuns && raceFields}
                  {!volumeFromRuns && volumeFields}
                  <Field label={t("settings.experience")}>
                    <select className="field" value={form.experience} onChange={(e) => set("experience", e.target.value as Experience)}>
                      <option value="first">{t("settings.exp.first")}</option>
                      <option value="returning">{t("settings.exp.returning")}</option>
                      <option value="experienced">{t("settings.exp.experienced")}</option>
                    </select>
                  </Field>
                </div>
                {fitnessFromRuns && (
                  <details className="mt-5 rounded-xl border border-line px-4 py-3">
                    <summary className="cursor-pointer text-sm text-ink-2">{t("fitness.manual")}</summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {raceFields}
                      {volumeFromRuns && volumeFields}
                    </div>
                  </details>
                )}
              </>
            );
          })()}
        </Card>

        <Card title={t("settings.week")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("settings.days")}>
              <select className="field" value={form.daysPerWeek} onChange={(e) => set("daysPerWeek", e.target.value)}>
                {[3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {t("settings.daysOption", { n: d })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.longRunDay")}>
              <select className="field" value={form.longRunDay} onChange={(e) => set("longRunDay", e.target.value)}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <option key={i} value={i}>
                    {weekdayName(i, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.units")}>
              <select className="field" value={form.units} onChange={(e) => set("units", e.target.value as Units)}>
                <option value="km">{t("settings.units.km")}</option>
                <option value="mi">{t("settings.units.mi")}</option>
              </select>
            </Field>
          </div>
        </Card>

        {error && <p className="text-sm font-medium text-warn">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={waitingForImport}>
            {waitingForImport ? t("setup.import.waiting", { percent: Math.round((importProgress ?? 1) * 100) }) : profile ? t("settings.save") : t("settings.generate")}
          </button>
        </div>
      </form>

      {/* Also offered before the first plan, to restore a backup on a new device. */}
      <DataCard hasData={profile !== null} />
    </div>
  );
}

/** Taps on "Import backup" that switch on the demo, and how long to wait for the next one. */
const DEMO_TAPS = 5;
const TAP_WINDOW_MS = 350;

function DataCard({ hasData }: { hasData: boolean }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const taps = useRef<{ count: number; timer?: number }>({ count: 0 });

  // Hidden demo: five quick taps on "Import backup" load Max Mustermann's data.
  // The file picker opens once the taps stop; browsers keep the tap's user
  // activation that long (WebKit forwards it through timers of up to 1 s).
  function onImportTap() {
    const tap = taps.current;
    window.clearTimeout(tap.timer);
    if (++tap.count >= DEMO_TAPS) {
      tap.count = 0;
      return startDemo();
    }
    tap.timer = window.setTimeout(() => {
      tap.count = 0;
      fileRef.current?.click();
    }, TAP_WINDOW_MS);
  }

  async function startDemo() {
    const current = readData();
    if (!current.demo && (current.profile || current.runs.length) && !confirm(t("demo.confirm"))) return;
    await loadDemo();
    router.push(href("/"));
  }

  function download() {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `m42-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file: File) {
    try {
      importData(await file.text());
      setMessage(t("data.restored"));
    } catch {
      setMessage(t("data.invalid"));
    }
  }

  return (
    <Card title={t("data.title")}>
      <p className="mb-4 text-sm text-ink-2">{t("data.body")}</p>
      <div className="flex flex-wrap gap-3">
        {hasData && (
          <button className="btn-ghost" onClick={download}>
            {t("data.export")}
          </button>
        )}
        <button className="btn-ghost" onClick={onImportTap}>
          {t("data.import")}
        </button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {hasData && (
          <button
            className="btn-ghost text-warn"
            onClick={() => {
              if (confirm(t("data.resetConfirm"))) resetData();
            }}
          >
            {t("data.reset")}
          </button>
        )}
      </div>
      {message && <p className="mt-3 text-sm text-ink-2">{message}</p>}
    </Card>
  );
}

const IMPORT_SINCE_DAYS = 365;

/** Optional first step: import runs so fitness, weekly distance and longest run don't have to be typed in. */
function ImportFirst({
  imported,
  setImported,
  fitnessFromRuns,
  volumeFromRuns,
  busy,
  onBusy,
  onDone,
}: {
  imported: ImportOutcome | null;
  setImported: (r: ImportOutcome | null) => void;
  fitnessFromRuns: boolean;
  volumeFromRuns: boolean;
  busy: boolean;
  onBusy: (progress: number | null) => void;
  onDone: (ok: boolean) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<MessageKey | null>(null);
  // A year of history gives a reliable max heart rate for the fitness estimate.
  const since = addDays(todayISO(), -IMPORT_SINCE_DAYS);
  return (
    <Card title={t("setup.import.title")}>
      <p className="mb-4 text-sm text-ink-2">{t("setup.import.body")}</p>
      {!fitnessFromRuns && (
        <ImportDropZone
          bare
          plan={null}
          since={since}
          onBusy={onBusy}
          onResult={(r) => {
            setError(null);
            setImported(r);
            onDone(true);
          }}
          onError={(k) => {
            setImported(null);
            setError(k);
            onDone(false);
          }}
        />
      )}
      {busy && <p className="mt-3 text-sm text-ink-2">{t("setup.import.keepTyping")}</p>}
      {imported && (
        <div className="mt-4 space-y-2">
          <ImportResultCard result={imported} since={since} />
          <p className={`text-sm ${fitnessFromRuns ? "text-ink-2" : "font-medium text-warn"}`}>{t(!fitnessFromRuns ? "setup.import.noFitness" : volumeFromRuns ? "setup.import.done" : "setup.import.doneNoVolume")}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-warn">
          {t(error)}
        </p>
      )}
      {!fitnessFromRuns && (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none py-2 text-sm font-medium text-accent">{t("setup.import.guides")}</summary>
          <div className="mt-2">
            <ImportGuides heading={false} />
          </div>
        </details>
      )}
    </Card>
  );
}

/** Current fitness as calculated from imported runs, with how it was derived. */
function RecordedFitness({ fitness, runs, units }: { fitness: DerivedFitness; runs: Run[]; units: Units }) {
  const { t, locale } = useI18n();
  const sources = runs.map((r) => r.source).filter((s): s is RunSource => !!s && s !== "manual");
  // Name the source most runs came from.
  const counts = new Map<RunSource, number>();
  for (const s of sources) counts.set(s, (counts.get(s) ?? 0) + 1);
  const source = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "file";
  const best = fitness.bestRun!;
  const bestParams = { dist: formatDistance(best.distance, units, 1, locale), time: formatClock(best.duration), date: { date: best.date } };
  // "No heart-rate summaries" only when that's true, not when there are just too few of them yet.
  const hasHeartRate = fitness.maxHr !== null || runs.some((r) => r.avgHr && r.source && r.source !== "manual");
  const explanation =
    fitness.method === "heart-rate"
      ? t("fitness.hr", { n: fitness.hrRuns, hr: fitness.maxHr ?? 0 })
      : hasHeartRate
        ? t("fitness.best", bestParams)
        : t("fitness.bestNoHr", bestParams);
  return (
    <div className="mb-5 rounded-xl bg-surface-2 p-4">
      <div className="text-sm font-medium">{t("fitness.title", { source: t(`source.${source}`) })}</div>
      <p className="mt-0.5 text-xs text-ink-2">{t("fitness.subtitle")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label={t("fitness.vdot")} value={`VDOT ${fitness.vdot!.toFixed(1)}`} hint={t("fitness.equivalent", { time: formatClock(predictTime(fitness.vdot!, MARATHON)) })} />
        <Stat label={t("fitness.weekly")} value={fitness.weeklyVolume !== null ? formatDistance(fitness.weeklyVolume, units, 0, locale) : "—"} />
        <Stat label={t("fitness.longest")} value={fitness.longestRun !== null ? formatDistance(fitness.longestRun, units, 1, locale) : "—"} />
      </div>
      <p className="mt-3 text-xs text-ink-2">{explanation}</p>
      {fitness.weeklyVolume === null && <p className="mt-1 text-xs text-ink-2">{t("fitness.noHistory")}</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
