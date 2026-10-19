"use client";

import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";
import { zoneRanges, ZONES, type Zone } from "@/lib/heart";
import { paceLabel } from "@/lib/paces";
import type { PaceKey, Units, WorkoutType } from "@/lib/types";
import { TypeDot } from "./ui";

interface GuideEntry {
  title: MessageKey;
  /** the training pace(s) it is run at; none for effort-based sessions */
  paces: PaceKey[];
  /** heart-rate zone(s) most of the work should land in */
  zones: Zone[];
}

/** Explained workout types, in the order a plan introduces them. */
export const GUIDE: Partial<Record<WorkoutType, GuideEntry>> = {
  easy: { title: "w.easy", paces: ["E"], zones: ["easy"] },
  long: { title: "w.long", paces: ["E"], zones: ["easy"] },
  strides: { title: "w.strides", paces: ["E", "R"], zones: ["easy"] },
  hills: { title: "w.hills", paces: [], zones: ["threshold", "interval"] },
  fartlek: { title: "w.fartlek", paces: ["T"], zones: ["marathon", "threshold"] },
  tempo: { title: "w.tempo", paces: ["T"], zones: ["threshold"] },
  intervals: { title: "w.intervals", paces: ["I"], zones: ["interval"] },
  marathon: { title: "w.mp", paces: ["M"], zones: ["marathon"] },
  "long-mp": { title: "w.longMp", paces: ["E", "M"], zones: ["easy", "marathon"] },
  timetrial: { title: "w.timetrial", paces: [], zones: ["threshold", "interval"] },
  tuneup: { title: "w.tuneup", paces: [], zones: ["threshold"] },
  rest: { title: "w.rest", paces: [], zones: [] },
};

function zoneText(zones: Zone[], maxHr: number | null, t: (k: MessageKey) => string) {
  if (!zones.length) return null;
  const ranges = maxHr ? zoneRanges(maxHr) : null;
  const first = ZONES.indexOf(zones[0]);
  const last = ZONES.indexOf(zones[zones.length - 1]);
  const names = zones.map((z) => t(`zone.${z}` as MessageKey)).join(" → ");
  return ranges ? `${names} · ${ranges[first][0]}–${ranges[last][1]} bpm` : names;
}

/** "Why this workout?" for one session, shown under its description. */
export function WorkoutWhy({ type, vdot, units, maxHr }: { type: WorkoutType; vdot: number; units: Units; maxHr: number | null }) {
  const { t } = useI18n();
  const key = type === "race" ? null : (type as keyof typeof GUIDE);
  if (!key || !GUIDE[key]) return null;
  const entry = GUIDE[key]!;
  const zones = zoneText(entry.zones, maxHr, t);
  return (
    // A named group: this sits inside the week's own <details className="group">.
    <details className="group/why mt-1.5">
      <summary className="cursor-pointer list-none text-xs font-medium text-accent">
        <span className="group-open/why:hidden">{t("guide.why")}</span>
        <span className="hidden group-open/why:inline">{t("guide.hide")}</span>
      </summary>
      <div className="mt-2 space-y-1.5 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
        <p>
          <span className="font-medium text-ink">{t("guide.whyLabel")}</span> {t(`info.${key}.why` as MessageKey)}
        </p>
        <p>
          <span className="font-medium text-ink">{t("guide.feelLabel")}</span> {t(`info.${key}.how` as MessageKey)}
        </p>
        {(entry.paces.length > 0 || zones) && (
          <p className="tabular">
            {entry.paces.map((p) => `${t(`pace.${p}.name`)} ${paceLabel(vdot, p, units)}`).join(" · ")}
            {entry.paces.length > 0 && zones ? " · " : ""}
            {zones && <span>♥ {zones}</span>}
          </p>
        )}
      </div>
    </details>
  );
}

/** All workout types explained, for the Plan page. */
export function WorkoutGuide({ vdot, units, maxHr }: { vdot: number; units: Units; maxHr: number | null }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(Object.keys(GUIDE) as (keyof typeof GUIDE)[]).map((type) => {
        const entry = GUIDE[type]!;
        const zones = zoneText(entry.zones, maxHr, t);
        return (
          <article key={type} className="rounded-xl border border-line p-4">
            <h3 className="flex items-center gap-2 font-medium">
              <TypeDot type={type} />
              {t(entry.title)}
            </h3>
            <p className="mt-1 text-sm text-ink-2">{t(`info.${type}.what` as MessageKey)}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium text-ink">{t("guide.whyLabel")}</dt>
                <dd className="text-ink-2">{t(`info.${type}.why` as MessageKey)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink">{t("guide.feelLabel")}</dt>
                <dd className="text-ink-2">{t(`info.${type}.how` as MessageKey)}</dd>
              </div>
              {(entry.paces.length > 0 || zones) && (
                <div>
                  <dt className="text-xs font-medium text-ink">{t("guide.targetLabel")}</dt>
                  <dd className="tabular text-ink-2">
                    {entry.paces.map((p) => `${t(`pace.${p}.name`)} ${paceLabel(vdot, p, units)}`).join(" · ")}
                    {zones && (
                      <div>
                        ♥ {zones}
                      </div>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
