"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { formatClock, formatPace, parseClock } from "@/lib/format";
import { weekIndexOf } from "@/lib/coach";
import { todayISO } from "@/lib/dates";
import { useAppData, usePlan } from "@/lib/store";
import type { PaceKey, Profile, Units } from "@/lib/types";
import { HALF, MARATHON, predictTime, vdotFromRace } from "@/lib/vdot";
import { PaceRoadmap } from "@/components/pace-guide";
import { Card, Skeleton } from "@/components/ui";
import { paceLabel } from "@/lib/paces";
import { RACE_DISTANCES } from "../settings/settings-form";

const PACE_KEYS: PaceKey[] = ["E", "M", "T", "I", "R"];

export function PaceCalculator() {
  const { t } = useI18n();
  const data = useAppData();
  const coaching = usePlan(data);
  if (!data) return <Skeleton />;
  return (
    <div className="space-y-6">
      {coaching && (
        <>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t("roadmap.title")}</h1>
          </div>
          <Card>
            <PaceRoadmap profile={coaching.profile} plan={coaching.plan} currentIndex={weekIndexOf(coaching.plan, todayISO())} />
          </Card>
        </>
      )}
      <Calculator profile={coaching?.profile ?? null} />
    </div>
  );
}

function Calculator({ profile }: { profile: Profile | null }) {
  const { t } = useI18n();
  const [distance, setDistance] = useState(String(profile?.recentRace.distance ?? 10000));
  const [time, setTime] = useState(profile ? formatClock(profile.recentRace.time) : "50:00");
  const [units, setUnits] = useState<Units>(profile?.units ?? "km");

  const seconds = parseClock(time);
  const vdot = seconds ? vdotFromRace(Number(distance), seconds) : null;
  const ok = vdot !== null && vdot > 15 && vdot < 90;
  const marathonTarget = profile?.goalTime ?? (ok ? predictTime(vdot!, MARATHON) : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("paces.title")}</h1>
        <p className="mt-1 text-ink-2">{t("paces.subtitle")}</p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("paces.distance")}</span>
            <select className="field" value={distance} onChange={(e) => setDistance(e.target.value)}>
              {RACE_DISTANCES.map((d) => (
                <option key={d.label} value={d.meters}>
                  {t(d.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("settings.finishTime")}</span>
            <input className="field tabular" value={time} onChange={(e) => setTime(e.target.value)} placeholder="h:mm:ss" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t("settings.units")}</span>
            <select className="field" value={units} onChange={(e) => setUnits(e.target.value as Units)}>
              <option value="km">{t("paces.perKm")}</option>
              <option value="mi">{t("paces.perMile")}</option>
            </select>
          </label>
        </div>
        {ok && (
          <p className="mt-4 text-sm text-ink-2">
            VDOT <span className="tabular text-2xl font-semibold text-ink">{vdot!.toFixed(1)}</span>
          </p>
        )}
        {!ok && <p className="mt-4 text-sm text-warn">{t("paces.invalid")}</p>}
      </Card>

      {ok && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t("paces.training")}>
            <ul className="divide-y divide-line">
              {PACE_KEYS.map((k) => (
                <li key={k} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <div className="text-sm font-medium">
                      <span className="mr-2 inline-block w-4 font-semibold">{k}</span>
                      {t(`pace.${k}.name`)}
                    </div>
                    <p className="ml-6 text-xs text-ink-2">{t(`pace.${k}.purpose`)}</p>
                  </div>
                  <span className="tabular shrink-0 text-sm font-medium">{paceLabel(vdot!, k, units)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t("paces.equivalents")}>
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-normal">{t("paces.col.distance")}</th>
                  <th className="pb-2 text-right font-normal">{t("paces.col.time")}</th>
                  <th className="pb-2 text-right font-normal">{t("paces.col.pace")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {RACE_DISTANCES.map((d) => {
                  const time = predictTime(vdot!, d.meters);
                  return (
                    <tr key={d.label}>
                      <td className="py-2.5">{t(d.label)}</td>
                      <td className="py-2.5 text-right font-medium">{formatClock(time)}</td>
                      <td className="py-2.5 text-right text-ink-2">{formatPace(time / (d.meters / 1000), units)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">{t("paces.equivalentsNote")}</p>
          </Card>
        </div>
      )}

      {marathonTarget && (
        <Card title={t(profile?.goalTime ? "paces.splitsGoal" : "paces.splitsPredicted", { time: formatClock(marathonTarget) })}>
          <Splits total={marathonTarget} />
          <p className="mt-3 text-xs text-muted">{t("paces.splitsNote")}</p>
        </Card>
      )}
    </div>
  );
}

function Splits({ total }: { total: number }) {
  const { t } = useI18n();
  const marks = [5, 10, 15, 20, HALF / 1000, 25, 30, 35, 40, MARATHON / 1000];
  return (
    <div className="tabular grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
      {marks.map((km) => (
        <div key={km} className="flex justify-between border-b border-line py-1.5">
          <span className="text-ink-2">{km === HALF / 1000 ? t("paces.half") : km === MARATHON / 1000 ? t("paces.finish") : `${km} km`}</span>
          <span className="font-medium">{formatClock((total * km * 1000) / MARATHON)}</span>
        </div>
      ))}
    </div>
  );
}
