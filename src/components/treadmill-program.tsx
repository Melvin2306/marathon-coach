"use client";

import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import type { MessageKey } from "@/i18n/translate";
import { formatClock, formatDistance } from "@/lib/format";
import { setTreadmillMode, useAppData } from "@/lib/store";
import { beltSpeed, formatSpeed, HILL_INCLINE, inclineFor, OUTDOOR_ONLY, programTotals, RUN_INCLINE, stepSeconds, workoutSteps } from "@/lib/treadmill";
import type { Step, Units, Workout } from "@/lib/types";

export function useTreadmillMode(): boolean {
  return useAppData()?.prefs?.treadmill ?? false;
}

/** Outdoor / Treadmill switch. The choice applies to the whole plan and is remembered. */
export function ModeSwitch() {
  const { t } = useI18n();
  const treadmill = useTreadmillMode();
  return (
    <div role="group" aria-label={t("tm.mode")} className="inline-flex shrink-0 rounded-lg border border-line p-0.5 text-xs">
      {[false, true].map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={treadmill === value}
          onClick={() => setTreadmillMode(value)}
          className={`rounded-md px-2 py-0.5 font-medium transition ${treadmill === value ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
        >
          {t(value ? "tm.treadmill" : "tm.outdoor")}
        </button>
      ))}
    </div>
  );
}

/** Belt speed + incline chips, the treadmill counterpart of the pace list. */
export function SpeedList({ workout, vdot, units }: { workout: Workout; vdot: number; units: Units }) {
  const { t, locale } = useI18n();
  if (!workout.paces.length) return null;
  return (
    <div className="tabular flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
      {workout.paces.map((k) => (
        <span key={k}>
          <span className="font-medium text-ink">{t(`pace.${k}.name`)}</span> {formatSpeed(beltSpeed(k, vdot), units, INTL_LOCALE[locale])}
        </span>
      ))}
      <span>· {RUN_INCLINE}%</span>
    </div>
  );
}

/** Work segments are named by their intensity (tm.work.*); the rest by their role. */
const STEP_LABEL: Record<Exclude<Step["kind"], "work">, MessageKey> = {
  warmup: "tm.step.warmup",
  run: "tm.step.run",
  recover: "tm.step.recover",
  cooldown: "tm.step.cooldown",
};

/** The full treadmill program for one workout. */
export function TreadmillProgram({ workout, vdot, units }: { workout: Workout; vdot: number; units: Units }) {
  const { t, locale } = useI18n();
  if (OUTDOOR_ONLY.has(workout.type)) {
    return <p className="mt-2 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">{t("tm.outdoorOnly")}</p>;
  }
  const blocks = workoutSteps(workout);
  if (!blocks) return null;
  const intl = INTL_LOCALE[locale];
  const totals = programTotals(blocks, vdot);

  const amount = (s: Step) => (s.distance ? formatDistance(s.distance, units, s.distance < 1000 ? 2 : 1, locale) : formatClock(s.seconds ?? 0));
  const row = (s: Step, key: string, nested = false) => (
    <li key={key} className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 py-1.5 ${nested ? "pl-3" : ""}`}>
      <span>
        <span className="font-medium text-ink">{t(s.kind === "work" ? (`tm.work.${s.pace}` as MessageKey) : STEP_LABEL[s.kind])}</span> <span className="text-ink-2">{amount(s)}</span>
        {s.distance ? <span className="text-muted"> · ≈ {formatClock(stepSeconds(s, vdot))}</span> : null}
      </span>
      <span className="tabular text-right font-semibold text-ink">{formatSpeed(beltSpeed(s.pace, vdot), units, intl)}</span>
      <span className="tabular w-10 text-right text-ink-2">{inclineFor(s.pace)}%</span>
    </li>
  );

  const hasHills = blocks.some((b) => "repeat" in b && b.steps.some((s) => s.pace === "hill"));
  const hasShortReps = blocks.some((b) => "repeat" in b && b.steps.some((s) => s.kind === "work" && (s.seconds ?? 999) <= 30));
  // General advice lives in <TreadmillBasics>; only session-specific tips here.
  const tips: MessageKey[] = [
    ...(hasHills ? (["tm.tip.hills"] as const) : []),
    ...(hasShortReps ? (["tm.tip.strides"] as const) : []),
    ...(workout.type === "long" || workout.type === "long-mp" ? (["tm.tip.long"] as const) : []),
  ];

  return (
    <div className="mt-2 rounded-lg bg-surface-2 p-3 text-xs">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-muted">
        <span>{t("tm.program")}</span>
        <span className="tabular">
          {t("tm.total", { time: formatClock(totals.seconds), dist: formatDistance(totals.meters, units, 1, locale) })}
        </span>
      </div>
      <ol className="divide-y divide-line">
        {blocks.map((b, i) =>
          "repeat" in b ? (
            <li key={i} className="py-1.5">
              <div className="font-medium text-ink">{t("tm.repeat", { n: b.repeat })}</div>
              <ol className="mt-0.5 border-l-2 border-line">{b.steps.map((s, j) => row(s, `${i}-${j}`, true))}</ol>
            </li>
          ) : (
            row(b, String(i))
          ),
        )}
      </ol>
      {tips.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
          {tips.map((k) => (
            <li key={k}>{t(k, { incline: RUN_INCLINE, hill: HILL_INCLINE })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** General treadmill advice, shown once while treadmill mode is on. */
export function TreadmillBasics() {
  const { t } = useI18n();
  if (!useTreadmillMode()) return null;
  return (
    <div className="rounded-xl border border-line bg-surface p-4 text-sm">
      <div className="font-medium">{t("tm.basics")}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
        {(["tm.tip.incline", "tm.tip.display", "tm.tip.heat"] as const).map((k) => (
          <li key={k}>{t(k, { incline: RUN_INCLINE })}</li>
        ))}
      </ul>
    </div>
  );
}
