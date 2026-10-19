"use client";

import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { beltSpeed, formatSpeed, RUN_INCLINE } from "@/lib/treadmill";
import { useTreadmillMode } from "./treadmill-program";
import type { MessageKey } from "@/i18n/translate";
import { todayISO } from "@/lib/dates";
import { formatClock, formatPace } from "@/lib/format";
import { PACE_KEYS, paceLabel } from "@/lib/paces";
import { PHASES } from "@/lib/plan";
import type { Plan, Profile } from "@/lib/types";
import { HALF, MARATHON, paceFor, predictTime } from "@/lib/vdot";

/** Explains how this week's marathon pace relates to the goal. */
function GoalBridge({ profile, plan, weekIndex }: { profile: Profile; plan: Plan; weekIndex: number }) {
  const { t } = useI18n();
  const units = profile.units;
  const week = plan.weeks[weekIndex];
  const nowM = formatPace(paceFor(week.vdot, "M"), units);
  const raceM = formatPace(paceFor(plan.targetVdot, "M"), units);
  // Paces are held near the last race result until a faster one confirms progress.
  const held = week.vdot < week.scheduledVdot - 0.05;
  const today = todayISO();
  const nextCheck = plan.weeks.flatMap((w) => w.workouts).find((w) => w.date >= today && (w.type === "timetrial" || w.type === "tuneup"));

  if (!profile.goalTime || !plan.goalVdot) {
    return <p className="text-sm text-ink-2">{t("guide.noGoal", { pace: nowM, time: formatClock(predictTime(plan.currentVdot, MARATHON)) })}</p>;
  }
  const goalPace = formatPace(profile.goalTime / (MARATHON / 1000), units);
  const reachesGoal = plan.targetVdot >= plan.goalVdot - 0.05;
  const goalBelowFitness = plan.goalVdot <= plan.currentVdot;
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-ink-2">{t("guide.goal", { time: formatClock(profile.goalTime) })}</span>{" "}
        <span className="tabular font-semibold">{goalPace}</span>
      </p>
      <p className="text-ink-2">
        {goalBelowFitness
          ? t("guide.goalBelowFitness", { pace: nowM })
          : reachesGoal
            ? t("guide.progress", { now: nowM, race: raceM })
            : t("guide.progressCapped", { now: nowM, race: raceM, hm: formatClock(predictTime(plan.goalVdot, HALF)) })}
      </p>
      {held && nextCheck && <p className="text-ink-2">{t("guide.held", { date: { date: nextCheck.date } })}</p>}
    </div>
  );
}

/** This week's training paces with how each should feel. */
export function PaceGuide({ profile, plan, weekIndex }: { profile: Profile; plan: Plan; weekIndex: number }) {
  const { t, locale } = useI18n();
  const treadmill = useTreadmillMode();
  const week = plan.weeks[weekIndex];
  return (
    <div className="space-y-4">
      <GoalBridge profile={profile} plan={plan} weekIndex={weekIndex} />
      <ul className="divide-y divide-line">
        {PACE_KEYS.map((k) => (
          <li key={k} className="flex items-start justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t(`pace.${k}.name`)}</div>
              <p className="text-xs text-ink-2">{t(`feel.${k}`)}</p>
            </div>
            <span className="tabular shrink-0 text-right text-sm font-semibold">
              {paceLabel(week.vdot, k, profile.units)}
              {treadmill && (
                <span className="block text-xs font-normal text-ink-2">
                  {formatSpeed(beltSpeed(k, week.vdot), profile.units, INTL_LOCALE[locale])} · {RUN_INCLINE}%
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("guide.effortNote")}</p>
    </div>
  );
}

/** How every training pace evolves from now to race day. */
export function PaceRoadmap({ profile, plan, currentIndex }: { profile: Profile; plan: Plan; currentIndex: number }) {
  const { t } = useI18n();
  const units = profile.units;
  const now = Math.max(0, Math.min(plan.weeks.length - 1, currentIndex));
  const phaseStarts = PHASES.map((phase) => plan.weeks.findIndex((w) => w.phase === phase)).filter((i) => i > now);
  const columns: { label: string; sub: string; vdot: number }[] = [
    { label: t("roadmap.now"), sub: t("plan.week", { n: now + 1 }), vdot: plan.weeks[now].vdot },
    ...phaseStarts.map((i) => ({ label: t(`phase.${plan.weeks[i].phase}.name` as MessageKey), sub: t("plan.week", { n: i + 1 }), vdot: plan.weeks[i].scheduledVdot })),
  ];
  if (plan.goalVdot) columns.push({ label: t("roadmap.goal"), sub: formatClock(profile.goalTime ?? 0), vdot: plan.goalVdot });

  return (
    <div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="tabular w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-normal" />
              {columns.map((c, i) => (
                <th key={i} className={`pb-2 text-right font-normal ${i === columns.length - 1 && plan.goalVdot ? "text-accent" : ""}`}>
                  <div className="font-medium text-ink-2">{c.label}</div>
                  <div>{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PACE_KEYS.map((k) => (
              <tr key={k}>
                <td className="py-2.5 pr-3 font-medium">{t(`pace.${k}.name`)}</td>
                {columns.map((c, i) => (
                  <td key={i} className={`py-2.5 text-right ${i === 0 ? "font-semibold" : "text-ink-2"}`}>
                    {paceLabel(c.vdot, k, units)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-2.5 pr-3 text-ink-2">{t("roadmap.marathon")}</td>
              {columns.map((c, i) => (
                <td key={i} className="py-2.5 text-right text-ink-2">
                  {formatClock(predictTime(c.vdot, MARATHON))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">{t("roadmap.note")}</p>
    </div>
  );
}
