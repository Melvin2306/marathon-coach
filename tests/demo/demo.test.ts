import { describe, expect, it } from "vitest";
import { demoData, nextBerlinMarathon } from "@/lib/demo";
import { deriveFitness, effectiveProfile } from "@/lib/fitness";
import { generatePlan } from "@/lib/plan";
import { raceDayProjection } from "@/lib/progress";
import { MARATHON, predictTime, realisticMarathon } from "@/lib/vdot";

const TODAY = "2026-10-20";
const data = demoData(TODAY);
const runs = data.runs;

describe("demo athlete", () => {
  it("is Max Mustermann, training for a sub-4 Berlin Marathon", () => {
    expect(data.demo).toBe(true);
    expect(data.profile).toMatchObject({ name: "Max Mustermann", raceName: "Berlin Marathon", raceDate: "2027-09-26", goalTime: 3 * 3600 + 59 * 60 });
    expect(nextBerlinMarathon("2026-06-01")).toBe("2026-09-27");
  });

  it("has a year of Apple Health runs, none in the future", () => {
    expect(runs.length).toBeGreaterThan(150);
    expect(runs.every((r) => r.source === "apple-health" && r.externalId?.startsWith("apple-health:"))).toBe(true);
    expect(runs.every((r) => r.date < TODAY && r.date >= "2025-10-20")).toBe(true);
    expect(new Set(runs.map((r) => r.id)).size).toBe(runs.length);
    expect(new Set(runs.map((r) => r.externalId)).size).toBe(runs.length);
    expect(runs.map((r) => r.date)).toEqual([...runs.map((r) => r.date)].sort());
  });

  it("runs look like real recordings", () => {
    for (const r of runs) {
      const pace = r.duration / (r.distance / 1000);
      expect(pace, r.date).toBeGreaterThan(240);
      expect(pace, r.date).toBeLessThan(500);
      expect(r.avgHr!).toBeGreaterThan(115);
      expect(r.maxHr!).toBeLessThanOrEqual(189);
      expect(r.details?.hrSeries?.length).toBeGreaterThan(10);
      expect(r.details?.paceSeries?.length).toBeGreaterThan(10);
      expect(r.details?.elevationGain).toBeLessThan(200);
      expect(r.details?.device).toBe("Max’s Apple Watch");
    }
    // Quality sessions are faster than easy runs.
    const avgPace = (kind: string) => {
      const list = runs.filter((r) => r.kind === kind);
      return list.reduce((s, r) => s + r.duration / (r.distance / 1000), 0) / list.length;
    };
    expect(avgPace("workout")).toBeLessThan(avgPace("easy"));
  });

  it("the app sees a realistic ~4:08 today and sub-4 by race day", () => {
    const fitness = deriveFitness(runs, data.profile!.planStart, TODAY);
    expect(fitness.method).toBe("heart-rate");
    expect(fitness.vdot!).toBeGreaterThan(38.5);
    expect(fitness.vdot!).toBeLessThan(41);
    expect(fitness.weeklyVolume! / 1000).toBeGreaterThan(20);
    const fullyTrained = predictTime(fitness.vdot!, MARATHON);
    expect(fullyTrained).toBeGreaterThan(3.75 * 3600);
    expect(fullyTrained).toBeLessThan(4.1 * 3600);
    // The realistic prediction today is a bit slower than the goal: there is work to do.
    const halfTime = predictTime(fitness.vdot!, 21097.5);
    expect(realisticMarathon(21097.5, halfTime, fitness.weeklyVolume!)).toBeGreaterThan(data.profile!.goalTime!);
    // Following the plan gets him under four hours on race day.
    const projection = raceDayProjection(generatePlan(effectiveProfile(data.profile!, fitness)))!;
    expect(projection.realistic).toBeLessThan(data.profile!.goalTime!);
  });

  it("has daily resting heart rate, HRV and VO2max", () => {
    expect(data.health!.restingHr.length).toBeGreaterThan(300);
    expect(data.health!.hrv.length).toBeGreaterThan(200);
    expect(data.health!.vo2max.length).toBeGreaterThan(40);
    const first = data.health!.restingHr.slice(0, 30).reduce((s, [, v]) => s + v, 0) / 30;
    const last = data.health!.restingHr.slice(-30).reduce((s, [, v]) => s + v, 0) / 30;
    expect(last).toBeLessThan(first);
  });

  it("is the same every time and small enough for local storage", () => {
    expect(JSON.stringify(demoData(TODAY))).toBe(JSON.stringify(data));
    expect(JSON.stringify(data).length).toBeLessThan(1_500_000);
  });
});
