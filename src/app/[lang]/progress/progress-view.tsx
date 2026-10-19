"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { addDays, formatDate, mondayOf, todayISO, weekdayName } from "@/lib/dates";
import { observedMaxHr } from "@/lib/fitness";
import { formatClock, formatDistance, formatPace } from "@/lib/format";
import { zoneRanges, ZONES } from "@/lib/heart";
import {
  dailyPoints,
  dailyTotals,
  dayToISO,
  easyShare,
  fitnessPoints,
  median,
  paceAtReference,
  raceDayProjection,
  raceTrend,
  referenceHr,
  rollingMean,
  rollingMedian,
  weeklyZones,
  weekStreak,
} from "@/lib/progress";
import { useAppData, usePlan } from "@/lib/store";
import type { Run, StravaAthlete, Units } from "@/lib/types";
import { MARATHON, predictTime } from "@/lib/vdot";
import { CalendarHeatmap, LineChart, StackedColumns, type CalendarDay } from "@/components/charts";
import { ZONE_COLORS } from "@/components/run-detail";
import { Card, NeedsSetup, Skeleton, Stat } from "@/components/ui";

const ZONE_WEEKS = 16;
const TREND_WEEKS = 26;
const CALENDAR_WEEKS = 52;
/** Calendar color steps by distance per day, in km. */
const CALENDAR_BINS_KM = [0.1, 5, 10, 15, 20];
/** Shoes are typically worn out at 500–800 km. */
const SHOE_WARN_METERS = 600_000;

export function ProgressView() {
  const { t, href, locale } = useI18n();
  const data = useAppData();
  const coaching = usePlan(data);
  if (!data) return <Skeleton />;
  if (!coaching) return <NeedsSetup />;

  const { profile, plan, fitness } = coaching;
  const { runs, health, strava } = data;
  const units = profile.units;
  const today = todayISO();
  const maxHr = observedMaxHr(runs, today);
  const fmtDay = (x: number) => formatDate(dayToISO(Math.round(x)), { day: "numeric", month: "short" }, locale);

  const estimates = maxHr ? fitnessPoints(runs, maxHr) : [];
  const trend = rollingMedian(estimates, 28);
  const zoneWeeks = maxHr ? weeklyZones(runs, maxHr, today, ZONE_WEEKS) : [];
  const recentShare = easyShare(zoneWeeks.slice(-4));
  const ranges = maxHr ? zoneRanges(maxHr) : null;
  const zoneLabels = ZONES.map((z, i) => `${t(`zone.${z}` as MessageKey)}${ranges ? ` ${ranges[i][0]}–${ranges[i][1]}` : ""}`);
  const resting = dailyPoints(health?.restingHr, today, 120);
  // SDNN (Apple Watch) and RMSSD (Garmin, Oura, WHOOP, Fitbit) aren't comparable, so only one is charted: the one measured most recently.
  const sdnn = dailyPoints(health?.hrv, today, 120);
  const rmssd = dailyPoints(health?.hrvRmssd, today, 120);
  const hrvKind = (rmssd.at(-1)?.x ?? -Infinity) > (sdnn.at(-1)?.x ?? -Infinity) ? "rmssd" : "sdnn";
  const hrv = hrvKind === "rmssd" ? rmssd : sdnn;
  const vo2 = dailyPoints(health?.vo2max, today, 365);
  const lastResting = rollingMean(resting, 7).at(-1);
  const restingMedian = median(resting.map((p) => p.y));
  const hrvMedian = median(hrv.map((p) => p.y));
  const trend26 = raceTrend(runs, estimates, today, TREND_WEEKS);
  const projection = raceDayProjection(plan);
  const refHr = maxHr ? referenceHr(maxHr) : null;
  const refPaces = maxHr && refHr ? paceAtReference(estimates, refHr, maxHr) : [];
  const refTrend = rollingMedian(refPaces, 28);
  const refNow = refTrend.at(-1);
  const refBefore = refNow ? [...refTrend].reverse().find((p) => p.x <= refNow.x - 56) : undefined;
  const hasHeartData = estimates.length > 0 || zoneWeeks.some((w) => w.minutes.some((m) => m > 0)) || resting.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("progress.title")}</h1>
        <p className="mt-1 text-ink-2">{t("progress.subtitle")}</p>
      </div>

      {!hasHeartData && (
        <Card>
          <p className="text-sm text-ink-2">
            {t("progress.empty")}{" "}
            <Link href={href("/import")} className="font-medium text-accent hover:underline">
              {t("log.importLink")}
            </Link>
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-4">
        <Stat
          label={t("progress.fitness")}
          value={fitness.vdot ? `VDOT ${fitness.vdot.toFixed(1)}` : `VDOT ${plan.currentVdot.toFixed(1)}`}
          hint={t("fitness.equivalent", { time: formatClock(predictTime(fitness.vdot ?? plan.currentVdot, MARATHON)) })}
        />
        <Stat label={t("progress.maxHr")} value={maxHr ? `${maxHr} bpm` : "—"} hint={t("progress.maxHrHint")} />
        <Stat
          label={t("progress.resting")}
          value={lastResting ? `${Math.round(lastResting.y)} bpm` : "—"}
          hint={lastResting ? t("progress.restingHint") : undefined}
        />
        <Stat
          label={t("progress.easyShare")}
          value={recentShare !== null ? `${Math.round(recentShare * 100)}%` : "—"}
          hint={t("progress.easyShareHint")}
        />
      </div>

      {trend26.length > 0 && (
        <Card title={t("progress.onTrack")}>
          <OnTrackSummary goal={profile.goalTime} latest={trend26[trend26.length - 1].realistic} projected={projection?.realistic ?? null} />
          <LineChart
            invertY
            ariaLabel={t("progress.onTrack")}
            series={[
              { id: "realistic", label: t("progress.realistic"), color: "var(--series-1)", mark: "line", points: trend26.map((p) => ({ x: p.x, y: p.realistic })) },
              { id: "potential", label: t("progress.potential"), color: "var(--muted)", mark: "line", points: trend26.map((p) => ({ x: p.x, y: p.potential })) },
              ...(projection
                ? [
                    {
                      id: "projection",
                      label: t("progress.projection"),
                      color: "var(--series-1)",
                      mark: "line" as const,
                      dash: true,
                      points: [{ x: trend26[trend26.length - 1].x, y: trend26[trend26.length - 1].realistic }, { x: projection.x, y: projection.realistic }],
                    },
                  ]
                : []),
            ]}
            refLines={profile.goalTime ? [{ y: profile.goalTime, label: t("progress.goalLine", { time: formatClock(profile.goalTime) }) }] : []}
            formatX={fmtDay}
            formatY={(y) => formatClock(y).replace(/:\d\d$/, "")}
          />
          <p className="mt-2 text-xs text-muted">{t("progress.onTrackNote")}</p>
        </Card>
      )}

      <ConsistencyCalendar runs={runs} today={today} units={units} />

      {refPaces.length > 0 && refHr && (
        <Card title={t("progress.paceAtHr", { hr: refHr })}>
          <p className="mb-3 text-sm text-ink-2">
            {t("progress.paceAtHrBody", { hr: refHr })}{" "}
            {refNow && refBefore && (
              <span className="font-medium text-ink">
                {t(refNow.y <= refBefore.y ? "progress.paceAtHrFaster" : "progress.paceAtHrSlower", { sec: Math.abs(Math.round(refBefore.y - refNow.y)) })}
              </span>
            )}
          </p>
          <LineChart
            invertY
            ariaLabel={t("progress.paceAtHr", { hr: refHr })}
            series={[
              { id: "runs", label: t("progress.perRun"), color: "var(--z2)", mark: "dots", points: refPaces },
              { id: "trend", label: t("progress.trend"), color: "var(--series-1)", mark: "line", points: refTrend },
            ]}
            formatX={fmtDay}
            formatY={(y) => formatPace(y, units)}
          />
        </Card>
      )}

      {estimates.length > 0 && (
        <Card title={t("progress.fitnessTrend")}>
          <p className="mb-3 text-sm text-ink-2">{t("progress.fitnessTrendBody")}</p>
          <LineChart
            ariaLabel={t("progress.fitnessTrend")}
            series={[
              { id: "runs", label: t("progress.perRun"), color: "var(--z2)", mark: "dots", points: estimates },
              { id: "trend", label: t("progress.trend"), color: "var(--series-1)", mark: "line", points: trend },
            ]}
            refLines={[
              ...(plan.goalVdot ? [{ y: plan.goalVdot, label: t("progress.goalLine", { time: formatClock(profile.goalTime ?? 0) }) }] : []),
            ]}
            formatX={fmtDay}
            formatY={(y) => y.toFixed(1)}
          />
        </Card>
      )}

      {zoneWeeks.some((w) => w.minutes.some((m) => m > 0)) && (
        <Card title={t("progress.zones")}>
          <p className="mb-3 text-sm text-ink-2">{t("progress.zonesBody", { max: maxHr ?? 0 })}</p>
          <StackedColumns
            ariaLabel={t("progress.zones")}
            columns={zoneWeeks.map((w) => ({ label: formatDate(w.start, { day: "numeric", month: "short" }, locale), values: w.minutes }))}
            colors={ZONE_COLORS}
            labels={zoneLabels}
            formatValue={(v) => `${Math.round(v)} min`}
          />
          {zoneWeeks.some((w) => w.estimated) && <p className="mt-2 text-xs text-muted">{t("progress.zonesEstimated")}</p>}
        </Card>
      )}

      {(resting.length > 0 || hrv.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {resting.length > 0 && (
            <Card title={t("progress.restingTitle")}>
              <p className="mb-3 text-sm text-ink-2">{t("progress.restingBody")}</p>
              <LineChart
                height={180}
                ariaLabel={t("progress.restingTitle")}
                series={[
                  { id: "day", label: t("progress.daily"), color: "var(--z2)", mark: "dots", points: resting },
                  { id: "avg", label: t("progress.sevenDay"), color: "var(--hr)", mark: "line", points: rollingMean(resting, 7) },
                ]}
                refLines={restingMedian !== null ? [{ y: restingMedian, label: t("progress.median", { value: `${Math.round(restingMedian)} bpm` }) }] : []}
                formatX={fmtDay}
                formatY={(y) => `${Math.round(y)}`}
              />
            </Card>
          )}
          {hrv.length > 0 && (
            <Card title={t("progress.hrvTitle")}>
              <p className="mb-3 text-sm text-ink-2">
                {t("progress.hrvBody")} <span className="text-muted">{t(hrvKind === "rmssd" ? "progress.hrvRmssd" : "progress.hrvSdnn")}</span>
              </p>
              <LineChart
                height={180}
                ariaLabel={t("progress.hrvTitle")}
                series={[
                  { id: "day", label: t("progress.daily"), color: "var(--z2)", mark: "dots", points: hrv },
                  { id: "avg", label: t("progress.sevenDay"), color: "var(--series-1)", mark: "line", points: rollingMean(hrv, 7) },
                ]}
                refLines={hrvMedian !== null ? [{ y: hrvMedian, label: t("progress.median", { value: `${Math.round(hrvMedian)} ms` }) }] : []}
                formatX={fmtDay}
                formatY={(y) => `${Math.round(y)} ms`}
              />
            </Card>
          )}
        </div>
      )}

      {vo2.length > 1 && (
        <Card title={t("progress.vo2Title")}>
          <p className="mb-3 text-sm text-ink-2">{t("progress.vo2Body")}</p>
          <LineChart
            height={170}
            ariaLabel={t("progress.vo2Title")}
            series={[{ id: "vo2", label: "VO₂max", color: "var(--series-1)", mark: "line", points: vo2 }]}
            formatX={fmtDay}
            formatY={(y) => y.toFixed(1)}
          />
        </Card>
      )}

      {strava?.athlete && <StravaProfile athlete={strava.athlete} units={units} />}
    </div>
  );
}

function OnTrackSummary({ goal, latest, projected }: { goal: number | null; latest: number; projected: number | null }) {
  const { t } = useI18n();
  return (
    <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Stat label={t("progress.realisticNow")} value={formatClock(latest)} />
      {projected !== null && <Stat label={t("progress.projectedRaceDay")} value={formatClock(projected)} hint={t("progress.projectedHint")} />}
      {goal && (
        <Stat
          label={t("dash.goal")}
          value={formatClock(goal)}
          hint={projected !== null ? t(projected <= goal ? "progress.onTrackYes" : "progress.onTrackGap", { gap: formatClock(Math.abs(projected - goal)) }) : undefined}
        />
      )}
    </div>
  );
}

function ConsistencyCalendar({ runs, today, units }: { runs: Run[]; today: string; units: Units }) {
  const { t, locale } = useI18n();
  const totals = dailyTotals(runs);
  if (!totals.size) return null;
  const first = addDays(mondayOf(today), -7 * (CALENDAR_WEEKS - 1));
  const weeks = Array.from({ length: CALENDAR_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d): CalendarDay | null => {
      const date = addDays(first, w * 7 + d);
      return date > today ? null : { date, value: (totals.get(date)?.meters ?? 0) / 1000 };
    }),
  );
  const inRange = [...totals.entries()].filter(([d]) => d >= first && d <= today);
  const activeWeeks = weeks.filter((w) => w.some((d) => d && d.value > 0)).length;
  const meters = inRange.reduce((s, [, v]) => s + v.meters, 0);
  const runCount = inRange.reduce((s, [, v]) => s + v.runs, 0);
  return (
    <Card title={t("progress.calendar")}>
      <p className="mb-3 text-sm text-ink-2">
        {t("progress.calendarStats", {
          runs: runCount,
          dist: formatDistance(meters, units, 0, locale),
          active: activeWeeks,
          total: CALENDAR_WEEKS,
          streak: weekStreak(totals, today),
        })}
      </p>
      <CalendarHeatmap
        weeks={weeks}
        colors={ZONE_COLORS}
        bins={CALENDAR_BINS_KM}
        weekdayLabels={[0, 1, 2, 3, 4, 5, 6].map((d) => weekdayName(d, locale, "short").slice(0, 2))}
        monthLabel={(date) => (Number(date.slice(8)) <= 7 ? formatDate(date, { month: "short" }, locale) : null)}
        formatTooltip={(day) =>
          `${formatDate(day.date, { weekday: "short", day: "numeric", month: "short" }, locale)} · ${
            day.value > 0 ? formatDistance(day.value * 1000, units, 1, locale) : t("progress.restDay")
          }`
        }
        ariaLabel={t("progress.calendar")}
        legendLess={t("progress.less")}
        legendMore={t("progress.more")}
      />
    </Card>
  );
}

function StravaProfile({ athlete, units }: { athlete: StravaAthlete; units: Units }) {
  const { t, locale } = useI18n();
  const periods = ["recent", "ytd", "all"] as const;
  return (
    <Card title={t("progress.strava", { name: athlete.name })}>
      {athlete.totals && (
        <div className="grid gap-4 sm:grid-cols-3">
          {periods.map((p) => {
            const total = athlete.totals![p];
            return (
              <Stat
                key={p}
                label={t(`progress.period.${p}`)}
                value={formatDistance(total.distance, units, 0, locale)}
                hint={t("progress.periodHint", { count: total.count, time: formatClock(total.movingTime), elevation: Math.round(total.elevation) })}
              />
            );
          })}
        </div>
      )}
      {athlete.shoes && athlete.shoes.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-ink-2">{t("progress.shoes")}</h3>
          <ul className="space-y-3">
            {athlete.shoes.map((s) => {
              const worn = s.distance >= SHOE_WARN_METERS;
              return (
                <li key={s.id}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span>
                      {s.name}
                      {s.primary && <span className="ml-2 text-xs text-muted">{t("progress.primaryShoe")}</span>}
                    </span>
                    <span className={`tabular ${worn ? "font-medium text-warn" : "text-ink-2"}`}>{formatDistance(s.distance, units, 0, locale)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.distance / 800_000) * 100)}%`, background: worn ? "var(--warn)" : "var(--series-1)" }} />
                  </div>
                  {worn && <p className="mt-1 text-xs text-warn">{t("progress.shoeWorn")}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!athlete.profileAccess && <p className="mt-4 text-xs text-muted">{t("import.strava.needsProfile")}</p>}
    </Card>
  );
}
