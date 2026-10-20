"use client";

import { useI18n } from "@/i18n/client";
import { actualVolumeByWeek, weekIndexOf } from "@/lib/coach";
import { formatDate, todayISO } from "@/lib/dates";
import { formatDistance } from "@/lib/format";
import { useAppData, usePlan } from "@/lib/store";
import type { Phase, PlanWeek } from "@/lib/types";
import { NeedsSetup, Skeleton, TypeDot, WorkoutLegend } from "@/components/ui";
import { ModeSwitch, TreadmillBasics } from "@/components/treadmill-program";
import { WorkoutGuide } from "@/components/workout-guide";
import { WorkoutRow } from "@/components/workout-row";
import { observedMaxHr } from "@/lib/fitness";

export function PlanView() {
  const { t, tm, tn, locale } = useI18n();
  const data = useAppData();
  const coaching = usePlan(data);
  if (!data) return <Skeleton />;
  if (!coaching) return <NeedsSetup />;

  const { profile, plan } = coaching;
  const { runs } = data;
  const units = profile.units;
  const today = todayISO();
  const current = weekIndexOf(plan, today);
  const actual = actualVolumeByWeek(plan, runs);
  const runDates = new Set(runs.map((r) => r.date));
  const maxHr = observedMaxHr(runs, today);
  const nowVdot = plan.weeks[Math.max(0, Math.min(plan.weeks.length - 1, current))].vdot;
  const phases = plan.weeks.reduce<{ phase: Phase; weeks: PlanWeek[] }[]>((groups, w) => {
    const last = groups.at(-1);
    if (last?.phase === w.phase) last.weeks.push(w);
    else groups.push({ phase: w.phase, weeks: [w] });
    return groups;
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("plan.title")}</h1>
          <p className="mt-1 text-ink-2">{t("plan.subtitle", { n: plan.weeks.length, race: profile.raceName || t("plan.raceDay") })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ModeSwitch />
          {current >= 0 && current < plan.weeks.length && (
            <a href={`#week-${current}`} className="btn-ghost">
              {t("plan.jump")}
            </a>
          )}
        </div>
      </div>
      <WorkoutLegend />
      <TreadmillBasics />

      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <span>
            <span className="block font-semibold sm:inline">{t("guide.typesTitle")}</span>
            <span className="block text-sm text-ink-2 sm:ml-2 sm:inline">{t("guide.typesSubtitle")}</span>
          </span>
          <span className="text-muted transition group-open:rotate-90">›</span>
        </summary>
        <div className="border-t border-line p-5">
          <WorkoutGuide vdot={nowVdot} units={units} maxHr={maxHr} />
        </div>
      </details>

      {phases.map(({ phase, weeks }) => (
        <section key={weeks[0].index} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">
              {t(`phase.${phase}.name`)} <span className="tabular text-sm font-normal text-muted">· {tn("plan.weeks", weeks.length)}</span>
            </h2>
            <p className="text-sm text-ink-2">{t(`phase.${phase}.focus`)}</p>
          </div>
          <div className="space-y-2">
            {weeks.map((w) => (
              <details
                key={w.index}
                id={`week-${w.index}`}
                open={w.index === current}
                className={`group scroll-mt-20 rounded-2xl border bg-surface ${w.index === current ? "border-accent/50" : "border-line"} ${w.index < current ? "opacity-75" : ""}`}
              >
                {/* Two lines on phones (week and date, then dots, labels and volume); one row from md up. */}
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-4">
                    <span className="flex items-baseline gap-3 md:contents">
                      <span className="tabular text-sm font-semibold md:w-20">{t("plan.week", { n: w.index + 1 })}</span>
                      <span className="text-sm text-ink-2 md:w-16">{formatDate(w.start, undefined, locale)}</span>
                    </span>
                    <span className="flex items-center gap-3 md:contents">
                      <span className="flex gap-1" aria-hidden>
                        {w.workouts.map((x) => (
                          <TypeDot key={x.date} type={x.type} />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 text-xs text-muted">
                        {w.index === current && <span className="mr-2 font-medium text-accent">{t("plan.thisWeek")}</span>}
                        {w.cutback && t("plan.cutback")}
                        {w.workouts.some((x) => x.type === "tuneup") && t("plan.tuneup")}
                      </span>
                      <span className="tabular text-sm whitespace-nowrap text-ink-2">
                        {w.index <= current && actual[w.index] > 0 && <span className="text-ink">{formatDistance(actual[w.index], units, 0, locale)} / </span>}
                        {formatDistance(w.volume, units, 0, locale)}
                      </span>
                    </span>
                  </span>
                  <span className="text-muted transition group-open:rotate-90">›</span>
                </summary>
                <div className="border-t border-line px-1 py-2">
                  <p className="px-3 pb-2 text-sm text-ink-2">{tm(w.focus, { units })}</p>
                  <ul className="space-y-0.5">
                    {w.workouts.map((x) => (
                      <WorkoutRow key={x.date} workout={x} vdot={w.vdot} units={units} done={runDates.has(x.date)} today={x.date === today} maxHr={maxHr} />
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
