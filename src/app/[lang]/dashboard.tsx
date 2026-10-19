"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { observedMaxHr } from "@/lib/fitness";
import { actualVolumeByWeek, coachInsights, recentWeeklyVolume, weekIndexOf, type Insight } from "@/lib/coach";
import { daysBetween, formatDate, todayISO } from "@/lib/dates";
import { formatClock, formatDistance } from "@/lib/format";
import { PHASES, phaseLengths } from "@/lib/plan";
import { saveProfile, useAppData, usePlan } from "@/lib/store";
import type { Profile, Workout } from "@/lib/types";
import { MARATHON, predictTime, realisticMarathon } from "@/lib/vdot";
import { PaceGuide } from "@/components/pace-guide";
import { ModeSwitch, TreadmillBasics } from "@/components/treadmill-program";
import { Card, NeedsSetup, PhaseBadge, Skeleton, Stat } from "@/components/ui";
import { VolumeChart } from "@/components/volume-chart";
import { WorkoutRow } from "@/components/workout-row";

export function Dashboard() {
  const { t, tm, tn, href, locale } = useI18n();
  const data = useAppData();
  const coaching = usePlan(data);
  if (!data) return <Skeleton />;
  if (!coaching) return <NeedsSetup />;

  const { profile, plan, fitness } = coaching;
  const { runs } = data;
  const units = profile.units;
  const today = todayISO();
  const daysLeft = daysBetween(today, profile.raceDate);
  const currentIndex = Math.min(plan.weeks.length - 1, Math.max(0, weekIndexOf(plan, today)));
  const week = plan.weeks[currentIndex];
  const actual = actualVolumeByWeek(plan, runs);
  const runDates = new Set(runs.map((r) => r.date));
  const todays = week.workouts.find((w) => w.date === today);
  const insights = coachInsights(profile, plan, runs, today, fitness.vdot !== null);
  const weekly = recentWeeklyVolume(profile, runs, today);
  const realistic = realisticMarathon(profile.recentRace.distance, profile.recentRace.time, weekly);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-2">
            {profile.name ? `${t("dash.hi", { name: profile.name })} · ` : ""}
            {profile.raceName || t("w.race")} · {formatDate(profile.raceDate, { day: "numeric", month: "long", year: "numeric" }, locale)}
          </p>
          {daysLeft > 0 ? (
            <h1 className="tabular mt-1 text-5xl font-semibold tracking-tight sm:text-6xl">
              {daysLeft} <span className="text-2xl font-medium text-ink-2 sm:text-3xl">{tn("dash.daysToGo", daysLeft)}</span>
            </h1>
          ) : daysLeft === 0 ? (
            <h1 className="mt-1 text-5xl font-semibold tracking-tight">{t("dash.raceDay")}</h1>
          ) : (
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">{t("dash.finished")}</h1>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <PhaseBadge phase={week.phase} />
          <span className="tabular">{t("dash.weekOf", { n: currentIndex + 1, total: plan.weeks.length })}</span>
        </div>
      </header>

      <PhaseTimeline total={plan.weeks.length} current={currentIndex} />
      <TreadmillBasics />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card
            title={t("dash.today")}
            action={
              <div className="flex items-center gap-3">
                <ModeSwitch />
                <LogLink workout={todays} />
              </div>
            }
          >
            {todays ? (
              <ul>
                <WorkoutRow workout={todays} vdot={week.vdot} units={units} done={runDates.has(today)} maxHr={observedMaxHr(runs, today)} />
              </ul>
            ) : (
              <p className="text-sm text-ink-2">{t("dash.planStarts", { date: { date: profile.planStart } })}</p>
            )}
          </Card>

          <Card
            title={t("dash.thisWeek", { date: { date: week.start } })}
            action={
              <span className="tabular text-xs text-ink-2">
                {formatDistance(actual[currentIndex], units, 0, locale)} / {formatDistance(week.volume, units, 0, locale)}
              </span>
            }
          >
            <p className="mb-3 text-sm text-ink-2">{tm(week.focus, { units })}</p>
            <ul className="-mx-3 space-y-0.5">
              {week.workouts.map((w) => (
                <WorkoutRow key={w.date} workout={w} vdot={week.vdot} units={units} done={runDates.has(w.date)} today={w.date === today} compact />
              ))}
            </ul>
          </Card>

          <Card title={t("dash.coach")}>
            <ul className="space-y-4">
              {insights.map((insight) => (
                <InsightItem key={insight.id} insight={insight} profile={profile} />
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title={t("dash.outlook")}>
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label={t("dash.realistic")}
                value={formatClock(realistic)}
                hint={t("dash.realisticHint", { dist: formatDistance(weekly, units, 0, locale), time: formatClock(predictTime(plan.currentVdot, MARATHON)) })}
              />
              <Stat
                label={t("dash.goal")}
                value={profile.goalTime ? formatClock(profile.goalTime) : "—"}
                hint={
                  plan.goalVdot ? (
                    `VDOT ${plan.goalVdot.toFixed(1)}`
                  ) : (
                    <Link href={href("/settings")} className="underline">
                      {t("dash.setGoal")}
                    </Link>
                  )
                }
              />
              <Stat label={t("dash.loggedRuns")} value={runs.length} />
              <Stat label={t("dash.totalDistance")} value={formatDistance(runs.reduce((s, r) => s + r.distance, 0), units, 0, locale)} />
            </div>
          </Card>

          <Card
            title={t("guide.title")}
            action={
              <Link href={href("/paces")} className="text-xs font-medium text-accent hover:underline">
                {t("guide.roadmapLink")}
              </Link>
            }
          >
            <PaceGuide profile={profile} plan={plan} weekIndex={currentIndex} />
          </Card>

        </div>
      </div>

      <Card title={t("dash.load")}>
        <VolumeChart weeks={plan.weeks} actual={actual} currentIndex={currentIndex} units={units} />
      </Card>
    </div>
  );
}

function LogLink({ workout }: { workout?: Workout }) {
  const { t, href } = useI18n();
  if (!workout || workout.type === "rest") {
    return (
      <Link href={href("/log")} className="text-xs font-medium text-accent hover:underline">
        {t("dash.logRun")}
      </Link>
    );
  }
  const kind = workout.type === "race" || workout.type === "tuneup" || workout.type === "timetrial" ? "race" : workout.type === "easy" || workout.type === "strides" ? "easy" : workout.type.startsWith("long") ? "long" : "workout";
  const params = new URLSearchParams({ date: workout.date, distance: String(workout.distance), kind });
  return (
    <Link href={`${href("/log")}?${params}`} className="btn-primary px-3 py-1.5 text-xs">
      {t("dash.logThis")}
    </Link>
  );
}

function InsightItem({ insight, profile }: { insight: Insight; profile: Profile }) {
  const { t, tm } = useI18n();
  const color = insight.tone === "good" ? "var(--good)" : insight.tone === "warn" ? "var(--warn)" : "var(--muted)";
  const icon = insight.tone === "good" ? "✓" : insight.tone === "warn" ? "!" : "i";
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: color }} aria-hidden>
        {icon}
      </span>
      <div>
        <div className="text-sm font-medium">{tm(insight.title, { units: profile.units })}</div>
        <p className="mt-0.5 text-sm text-ink-2">{tm(insight.body, { units: profile.units })}</p>
        {insight.fitnessUpdate && (
          <button className="btn-ghost mt-2 px-3 py-1 text-xs" onClick={() => saveProfile({ ...profile, recentRace: insight.fitnessUpdate! })}>
            {t("dash.updateFitness")}
          </button>
        )}
      </div>
    </li>
  );
}

function PhaseTimeline({ total, current }: { total: number; current: number }) {
  const { t } = useI18n();
  const lengths = phaseLengths(total);
  const phases = PHASES.filter((p) => lengths[p] > 0);
  const progress = ((current + 0.5) / total) * 100;
  return (
    <div>
      <div className="relative flex h-2 gap-0.5 overflow-hidden rounded-full">
        {phases.map((p) => (
          <div key={p} className="h-full bg-surface-2" style={{ flex: lengths[p] }} />
        ))}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 flex gap-0.5 text-xs text-muted">
        {phases.map((p) => (
          <div key={p} className="truncate" style={{ flex: lengths[p] }}>
            {t(`phase.${p}.name`)} <span className="tabular">· {t("plan.weeksShort", { n: lengths[p] })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
