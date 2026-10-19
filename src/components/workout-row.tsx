"use client";

import { useI18n } from "@/i18n/client";
import { formatDate, weekday, weekdayName } from "@/lib/dates";
import { formatDistance } from "@/lib/format";
import { paceLabel } from "@/lib/paces";
import type { Units, Workout } from "@/lib/types";
import { SpeedList, TreadmillProgram, useTreadmillMode } from "./treadmill-program";
import { TypeDot } from "./ui";
import { WorkoutWhy } from "./workout-guide";

/** The target paces of a workout, named: "Easy 6:23–7:20/km · Threshold 5:34/km". */
export function PaceList({ workout, vdot, units }: { workout: Workout; vdot: number; units: Units }) {
  const { t } = useI18n();
  if (!workout.paces.length) return null;
  return (
    <div className="tabular flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
      {workout.paces.map((k) => (
        <span key={k}>
          <span className="font-medium text-ink">{t(`pace.${k}.name`)}</span> {paceLabel(vdot, k, units)}
        </span>
      ))}
    </div>
  );
}

export function WorkoutRow({
  workout,
  vdot,
  units,
  done,
  today,
  compact,
  maxHr = null,
}: {
  workout: Workout;
  vdot: number;
  units: Units;
  done?: boolean;
  today?: boolean;
  compact?: boolean;
  /** enables heart-rate targets in the explanation */
  maxHr?: number | null;
}) {
  const { t, tm, locale } = useI18n();
  const treadmill = useTreadmillMode();
  const rest = workout.type === "rest";
  return (
    <li
      className={`flex gap-3 rounded-xl px-3 py-2.5 ${today ? "bg-surface-2 ring-1 ring-accent/40" : ""} ${rest ? "opacity-60" : ""}`}
    >
      <div className="w-12 shrink-0 pt-0.5 text-xs text-muted">
        <div className="font-medium text-ink-2">{weekdayName(weekday(workout.date), locale, "short")}</div>
        <div>{formatDate(workout.date, undefined, locale)}</div>
      </div>
      <TypeDot type={workout.type} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">
            {tm(workout.title, { units })}
            {done && <span className="ml-2 text-xs font-medium text-good">✓ {t("workout.done")}</span>}
          </span>
          {workout.distance > 0 && (
            <span className="tabular shrink-0 text-sm text-ink-2">{formatDistance(workout.distance, units, units === "km" ? 0 : 1, locale)}</span>
          )}
        </div>
        {!compact && workout.description && <p className="mt-0.5 text-sm text-ink-2">{tm(workout.description, { units, vdot })}</p>}
        {!rest && (treadmill && !compact ? (
          <TreadmillProgram workout={workout} vdot={vdot} units={units} />
        ) : (
          <div className="mt-1">
            {treadmill ? <SpeedList workout={workout} vdot={vdot} units={units} /> : <PaceList workout={workout} vdot={vdot} units={units} />}
          </div>
        ))}
        {!compact && <WorkoutWhy type={workout.type} vdot={vdot} units={units} maxHr={maxHr} />}
      </div>
    </li>
  );
}
