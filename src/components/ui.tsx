"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { LogoMark } from "./logo";
import type { Phase, Workout, WorkoutType } from "@/lib/types";

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-ink-2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-2">{hint}</div>}
    </div>
  );
}

type Category = "easy" | "quality" | "long" | "race" | "rest";
const CATEGORIES: Category[] = ["easy", "quality", "long", "race", "rest"];

export function categoryOf(type: WorkoutType): Category {
  switch (type) {
    case "rest":
      return "rest";
    case "easy":
    case "strides":
      return "easy";
    case "long":
    case "long-mp":
      return "long";
    case "race":
    case "tuneup":
    case "timetrial":
      return "race";
    default:
      return "quality";
  }
}

export function TypeDot({ type, className = "" }: { type: WorkoutType; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-full ${className}`}
      style={{ background: `var(--${categoryOf(type)})` }}
    />
  );
}

export function WorkoutLegend() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {CATEGORIES.map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: `var(--${c})` }} />
          {t(`category.${c}`)}
        </span>
      ))}
    </div>
  );
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  const { t } = useI18n();
  return (
    <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-2">
      {t(`phase.${phase}.name`)}
    </span>
  );
}

export function Skeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}

export function NeedsSetup() {
  const { t, href } = useI18n();
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <LogoMark size={64} className="mx-auto mb-6" />
      <h1 className="text-3xl font-semibold tracking-tight">{t("setup.title")}</h1>
      <p className="mt-3 text-ink-2">{t("setup.body")}</p>
      <Link href={href("/settings")} className="btn-primary mt-8">
        {t("setup.cta")}
      </Link>
    </div>
  );
}

export function isQuality(w: Workout) {
  return categoryOf(w.type) === "quality";
}
