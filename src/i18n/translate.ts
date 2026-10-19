import { INTL_LOCALE, type Locale } from "./config";
import { de } from "./messages/de";
import { en } from "./messages/en";
import { formatDate } from "@/lib/dates";
import { formatClock, formatDistance } from "@/lib/format";
import { paceLabel } from "@/lib/paces";
import type { PaceKey, Units } from "@/lib/types";
import { HALF, predictTime } from "@/lib/vdot";

export type MessageKey = keyof typeof en;
/** Keys that also have a `.one` variant for a count of exactly 1. */
export type PluralKey = { [K in MessageKey]: `${K}.one` extends MessageKey ? K : never }[MessageKey];
export type Messages = Record<MessageKey, string>;

const MESSAGES: Record<Locale, Messages> = { en, de };

/** A parameter is plain text/number, a distance (rendered in the runner's units) or a date. */
export type MessageParam = string | number | { meters: number } | { date: string };

/** A translatable message produced outside React, e.g. by the plan generator. */
export interface Msg {
  key: MessageKey;
  params?: Record<string, MessageParam>;
}

export const msg = (key: MessageKey, params?: Msg["params"]): Msg => ({ key, params });

/**
 * How to render units-, date- and pace-dependent parameters. With a `vdot`,
 * messages can use {E} {M} {T} {I} {R} for that fitness level's training
 * paces and {HM} / {T5K} for its predicted half-marathon / 5K times.
 */
export interface FormatContext {
  units?: Units;
  vdot?: number;
}

const PACE_PLACEHOLDER = /^[EMTIR]$/;

/** Picks the singular variant when `n` is 1; `{n}` is available in the message. */
export function translatePlural(locale: Locale, key: PluralKey, n: number, params?: Msg["params"]): string {
  return translate(locale, n === 1 ? (`${key}.one` as MessageKey) : key, { n, ...params });
}

export function translate(locale: Locale, key: MessageKey, params?: Msg["params"], ctx: FormatContext = {}): string {
  const template = MESSAGES[locale][key] ?? en[key] ?? key;
  const units = ctx.units ?? "km";
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      if (ctx.vdot === undefined) return match;
      if (PACE_PLACEHOLDER.test(name)) return paceLabel(ctx.vdot, name as PaceKey, units);
      if (name === "HM") return formatClock(predictTime(ctx.vdot, HALF));
      if (name === "T5K") return formatClock(predictTime(ctx.vdot, 5000));
      return match;
    }
    if (typeof value === "number") return value.toLocaleString(INTL_LOCALE[locale]);
    if (typeof value === "string") return value;
    if ("meters" in value) return formatDistance(value.meters, units, 1, locale);
    return formatDate(value.date, { day: "numeric", month: "long" }, locale);
  });
}
