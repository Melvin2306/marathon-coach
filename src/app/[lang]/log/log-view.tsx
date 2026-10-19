"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import type { MessageKey } from "@/i18n/translate";
import { weekIndexOf } from "@/lib/coach";
import { formatDate, todayISO } from "@/lib/dates";
import { formatClock, formatDistance, formatPace, parseClock, parseDecimal, unitLength } from "@/lib/format";
import { addRun, deleteRun, useAppData, usePlan } from "@/lib/store";
import type { Plan, Profile, RunKind, RunSource } from "@/lib/types";
import { observedMaxHr } from "@/lib/fitness";
import { RunDetail } from "@/components/run-detail";
import { Card, NeedsSetup, Skeleton } from "@/components/ui";

const KINDS: RunKind[] = ["easy", "long", "workout", "race", "other"];

interface Prefill {
  date?: string;
  distance?: string;
  kind?: string;
}

export function LogView() {
  const { t, tn, href, locale } = useI18n();
  const params = useSearchParams();
  const prefill: Prefill = { date: params.get("date") ?? undefined, distance: params.get("distance") ?? undefined, kind: params.get("kind") ?? undefined };
  const data = useAppData();
  const coaching = usePlan(data);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Skeleton />;
  if (!coaching) return <NeedsSetup />;
  const { profile, plan } = coaching;
  const { runs } = data;
  const maxHr = observedMaxHr(runs, todayISO());
  const units = profile.units;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("log.title")}</h1>
          <p className="mt-1 text-ink-2">{t("log.subtitle")}</p>
        </div>
        <Link href={href("/import")} className="btn-ghost">
          {t("log.importLink")}
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <LogForm profile={profile} plan={plan} prefill={prefill} />
        </div>
        <div className="lg:col-span-3">
          <Card title={tn("log.history", runs.length)}>
            {runs.length === 0 ? (
              <p className="text-sm text-ink-2">{t("log.empty")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {[...runs].reverse().map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="w-14 shrink-0 text-xs text-muted">{formatDate(r.date, undefined, locale)}</div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={open === r.id}
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                          <span className="font-medium">{formatDistance(r.distance, units, 2, locale)}</span>
                          <span className="tabular text-ink-2">{formatClock(r.duration)}</span>
                          <span className="tabular text-ink-2">{formatPace(r.duration / (r.distance / 1000), units)}</span>
                          <span className="text-xs text-muted">
                            {t(`kind.${r.kind}`)}
                            {r.rpe !== null && ` · RPE ${r.rpe}`}
                          </span>
                          {r.avgHr && (
                            <span className="tabular text-xs font-medium" style={{ color: "var(--hr)" }} title={t("detail.avgHr")}>
                              ♥ {r.avgHr}
                            </span>
                          )}
                          {r.details?.elevationGain ? <span className="tabular text-xs text-muted">↗ {r.details.elevationGain} m</span> : null}
                          {r.indoor && <span className="rounded-full border border-line px-2 py-px text-[11px] text-muted">{t("tm.treadmill")}</span>}
                          {r.source && r.source !== "manual" && (
                            <span className="rounded-full border border-line px-2 py-px text-[11px] text-muted">{t(`source.${r.source}`)}</span>
                          )}
                        </div>
                        {r.notes && <p className="mt-0.5 truncate text-sm text-ink-2">{r.notes}</p>}
                      </button>
                      <span className={`text-muted transition ${open === r.id ? "rotate-90" : ""}`} aria-hidden>
                        ›
                      </span>
                      <button className="text-xs text-muted hover:text-warn" onClick={() => deleteRun(r.id)}>
                        {t("log.delete")}
                      </button>
                    </div>
                    {open === r.id && <RunDetail run={r} units={units} maxHr={maxHr} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function LogForm({ profile, plan, prefill }: { profile: Profile; plan: Plan; prefill: Prefill }) {
  const { t, tm, locale } = useI18n();
  const units = profile.units;
  const u = unitLength(units);
  const initialDistance =
    prefill.distance && Number(prefill.distance) > 0
      ? (Number(prefill.distance) / u).toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: 2, useGrouping: false })
      : "";
  const [date, setDate] = useState(prefill.date ?? todayISO());
  const [kind, setKind] = useState<RunKind>(KINDS.includes(prefill.kind as RunKind) ? (prefill.kind as RunKind) : "easy");
  const [distance, setDistance] = useState(initialDistance);
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState(4);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<{ mergedInto?: RunSource } | null>(null);

  const meters = parseDecimal(distance) * u;
  const seconds = parseClock(duration);
  const valid = meters > 0 && !!seconds && seconds > 0;
  const week = plan.weeks[weekIndexOf(plan, date)];
  const planned = week?.workouts.find((w) => w.date === date);

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    const { merged, run } = addRun({ date, kind, distance: meters, duration: seconds!, rpe, notes: notes.trim(), source: "manual" });
    setDistance("");
    setDuration("");
    setNotes("");
    setSaved(merged ? { mergedInto: run.source } : {});
  }

  return (
    <Card title={t("log.form.title")}>
      <form onSubmit={submit} className="space-y-4" onChange={() => setSaved(null)}>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("log.form.date")}</span>
            <input type="date" className="field" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("log.form.type")}</span>
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as RunKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {planned && planned.type !== "rest" && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            {t("log.form.planned")}: <span className="font-medium text-ink">{tm(planned.title, { units })}</span> ·{" "}
            {formatDistance(planned.distance, units, 0, locale)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("log.form.distance", { units })}</span>
            <input inputMode="decimal" className="field tabular" value={distance} onChange={(e) => setDistance(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("log.form.time")}</span>
            <input className="field tabular" placeholder="h:mm:ss" value={duration} onChange={(e) => setDuration(e.target.value)} required />
          </label>
        </div>
        {valid && <p className="tabular text-xs text-ink-2">{t("log.form.pace", { pace: formatPace(seconds! / (meters / 1000), units) })}</p>}
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm font-medium">
            {t("log.form.effort")}{" "}
            <span className="tabular font-normal text-ink-2">
              {rpe} · {t(`rpe.${rpe}` as MessageKey)}
            </span>
          </span>
          <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t("log.form.notes")}</span>
          <textarea className="field min-h-20" placeholder={t("log.form.notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary w-full" disabled={!valid}>
          {t("log.form.save")}
        </button>
        {saved && (
          <p role="status" className="text-center text-sm text-good">
            {saved.mergedInto ? t("log.form.merged", { source: t(`source.${saved.mergedInto}`) }) : t("log.form.saved")}
          </p>
        )}
      </form>
    </Card>
  );
}
