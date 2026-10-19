// Turns the plan and the run log into short, actionable coaching notes.
import { msg, type MessageKey, type Msg } from "@/i18n/translate";
import { addDays, daysBetween, mondayOf } from "./dates";
import { formatClock } from "./format";
import type { Plan, Profile, RaceResult, Run } from "./types";
import { maxVdotGain, realisticMarathon, vdotFromRace } from "./vdot";

export interface Insight {
  id: string;
  tone: "good" | "warn" | "info";
  title: Msg;
  body: Msg;
  /** a newer race result the runner can adopt as their fitness benchmark */
  fitnessUpdate?: RaceResult;
}

export function weekIndexOf(plan: Plan, date: string): number {
  if (!plan.weeks.length) return -1;
  return Math.floor(daysBetween(plan.weeks[0].start, mondayOf(date)) / 7);
}

export function actualVolumeByWeek(plan: Plan, runs: Run[]): number[] {
  const totals = plan.weeks.map(() => 0);
  const planStart = plan.weeks[0]?.workouts[0]?.date ?? "";
  for (const run of runs) {
    if (run.date < planStart) continue;
    const i = weekIndexOf(plan, run.date);
    if (i >= 0 && i < totals.length) totals[i] += run.distance;
  }
  return totals;
}

const TIP_COUNT = 9;

/** Average weekly distance over the last 4 weeks of logged runs, or the profile's estimate before there is enough history. */
export function recentWeeklyVolume(profile: Profile, runs: Run[], today: string): number {
  const recent = runs.filter((r) => daysBetween(r.date, today) >= 0 && daysBetween(r.date, today) < 28);
  const span = runs.length ? daysBetween(runs[0].date, today) : 0;
  if (recent.length < 4 || span < 21) return profile.weeklyVolume;
  return recent.reduce((s, r) => s + r.distance, 0) / 4;
}

/** `fitnessFromRuns`: fitness is derived from recorded runs, so it updates itself and needs no manual recalibration. */
export function coachInsights(profile: Profile, plan: Plan, runs: Run[], today: string, fitnessFromRuns = false): Insight[] {
  const insights: Insight[] = [];
  const current = weekIndexOf(plan, today);
  const volumes = actualVolumeByWeek(plan, runs);

  // Compliance with last week's plan.
  const last = plan.weeks[current - 1];
  if (last && last.volume > 0) {
    const ratio = volumes[current - 1] / last.volume;
    const pct = Math.round(ratio * 100);
    if (ratio === 0) {
      insights.push({ id: "compliance", tone: "info", title: msg("coach.noRuns.title"), body: msg("coach.noRuns.body") });
    } else if (ratio < 0.7) {
      insights.push({ id: "compliance", tone: "warn", title: msg("coach.volume.title", { pct }), body: msg("coach.low.body") });
    } else if (ratio > 1.15) {
      insights.push({ id: "compliance", tone: "warn", title: msg("coach.volume.title", { pct }), body: msg("coach.high.body") });
    } else {
      insights.push({ id: "compliance", tone: "good", title: msg("coach.onPlan.title"), body: msg("coach.onPlan.body", { pct }) });
    }
  }

  // Easy runs drifting too hard. Imported runs without an effort rating don't count.
  const recentEasy = runs.filter(
    (r): r is Run & { rpe: number } =>
      r.kind === "easy" && r.rpe !== null && daysBetween(r.date, today) <= 14 && daysBetween(r.date, today) >= 0,
  );
  if (recentEasy.length >= 3) {
    const avg = recentEasy.reduce((s, r) => s + r.rpe, 0) / recentEasy.length;
    if (avg >= 6) {
      insights.push({ id: "easy-hot", tone: "warn", title: msg("coach.easyHot.title"), body: msg("coach.easyHot.body", { rpe: avg.toFixed(1) }) });
    }
  }

  // A single run much longer than anything in the previous 30 days is the
  // clearest injury signal in large running datasets (Frandsen et al. 2025, BJSM).
  const spike = runs
    .filter((r) => daysBetween(r.date, today) >= 0 && daysBetween(r.date, today) <= 7)
    .map((r) => {
      const prior = runs.filter((p) => daysBetween(p.date, r.date) > 0 && daysBetween(p.date, r.date) <= 30);
      const longestBefore = Math.max(0, ...prior.map((p) => p.distance));
      return { run: r, longestBefore, enoughHistory: prior.length >= 3 };
    })
    .find((x) => x.enoughHistory && x.run.kind !== "race" && x.run.distance > x.longestBefore * 1.1);
  if (spike) {
    insights.push({
      id: "spike",
      tone: "warn",
      title: msg("coach.spike.title"),
      body: msg("coach.spike.body", { dist: { meters: spike.run.distance }, prev: { meters: spike.longestBefore }, pct: Math.round((spike.run.distance / spike.longestBefore - 1) * 100) }),
    });
  }

  // A newer race than the benchmark: offer to recalibrate.
  const benchmarkVdot = vdotFromRace(profile.recentRace.distance, profile.recentRace.time);
  const latestRace = [...runs].reverse().find((r) => r.kind === "race" && r.distance >= 3000 && daysBetween(r.date, today) <= 60);
  if (!fitnessFromRuns && latestRace && !(latestRace.distance === profile.recentRace.distance && latestRace.duration === profile.recentRace.time)) {
    const raceVdot = vdotFromRace(latestRace.distance, latestRace.duration);
    if (Math.abs(raceVdot - benchmarkVdot) >= 0.5) {
      const faster = raceVdot > benchmarkVdot;
      insights.push({
        id: "fitness",
        tone: faster ? "good" : "info",
        title: msg(faster ? "coach.fitnessUp.title" : "coach.fitnessDown.title"),
        body: msg("coach.fitness.body", { date: { date: latestRace.date }, time: formatClock(realisticMarathon(latestRace.distance, latestRace.duration, recentWeeklyVolume(profile, runs, today))) }),
        fitnessUpdate: { distance: latestRace.distance, time: latestRace.duration },
      });
    }
  }

  // Goal realism.
  if (plan.goalVdot && plan.goalVdot - plan.currentVdot > maxVdotGain(plan.currentVdot)) {
    const realistic = realisticMarathon(profile.recentRace.distance, profile.recentRace.time, recentWeeklyVolume(profile, runs, today));
    insights.push({ id: "goal", tone: "info", title: msg("coach.ambitious.title"), body: msg("coach.ambitious.body", { time: formatClock(realistic) }) });
  }

  // Upcoming long run reminder.
  const week = plan.weeks[current];
  const longRun = week?.workouts.find((w) => (w.type === "long" || w.type === "long-mp") && w.date >= today);
  if (longRun && daysBetween(today, longRun.date) <= 2 && longRun.distance >= 20000) {
    const when: MessageKey = longRun.date === today ? "coach.longRun.today" : longRun.date === addDays(today, 1) ? "coach.longRun.tomorrow" : "coach.longRun.soon";
    insights.push({ id: "long-run", tone: "info", title: msg(when), body: msg("coach.longRun.body") });
  }

  const tip = Math.max(0, current) % TIP_COUNT;
  insights.push({ id: "tip", tone: "info", title: msg("coach.tip.title"), body: msg(`tip.${tip}` as MessageKey) });
  return insights;
}
