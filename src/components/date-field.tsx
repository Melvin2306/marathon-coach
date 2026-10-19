// A date picker whose calendar always starts on Monday (used inside client components). Native date inputs
// take the first weekday from the browser locale, which HTML can't override.
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { addDays, formatDate, mondayOf, parseISO, todayISO, toISO, weekdayName } from "@/lib/dates";

const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

function addMonths(iso: string, n: number): string {
  const d = parseISO(firstOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toISO(d);
}

const clamp = (iso: string, min?: string, max?: string) => (min && iso < min ? min : max && iso > max ? max : iso);

export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value || todayISO());
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const dialogId = `${id ?? autoId}-calendar`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [open, focus]);

  const toggle = () => {
    setFocus(value || clamp(todayISO(), min, max));
    setOpen((o) => !o);
  };
  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };
  const move = (days: number) => setFocus((f) => clamp(addDays(f, days), min, max));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      ArrowUp: () => move(-7),
      ArrowDown: () => move(7),
      PageUp: () => setFocus((f) => clamp(addMonths(f, -1), min, max)),
      PageDown: () => setFocus((f) => clamp(addMonths(f, 1), min, max)),
      Escape: () => setOpen(false),
    };
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  };

  // Six Monday-first weeks covering the month in view.
  const month = firstOfMonth(focus);
  const gridStart = mondayOf(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = todayISO();

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        className="field flex items-center justify-between gap-2 text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={toggle}
      >
        <span className="tabular">{value ? formatDate(value, { weekday: "short", day: "numeric", month: "short", year: "numeric" }, locale) : "—"}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
      </button>
      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label={t("date.choose")}
          className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-line bg-surface p-3 shadow-lg"
          onKeyDown={onKeyDown}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="rounded-md px-3 py-2 text-ink-2 hover:bg-surface-2 md:px-2 md:py-1" aria-label={t("date.prev")} onClick={() => setFocus((f) => clamp(addMonths(f, -1), min, max))}>
              ‹
            </button>
            <span className="text-sm font-medium">{formatDate(month, { month: "long", year: "numeric" }, locale)}</span>
            <button type="button" className="rounded-md px-3 py-2 text-ink-2 hover:bg-surface-2 md:px-2 md:py-1" aria-label={t("date.next")} onClick={() => setFocus((f) => clamp(addMonths(f, 1), min, max))}>
              ›
            </button>
          </div>
          <div ref={gridRef} role="grid" className="grid grid-cols-7 gap-0.5 text-center text-sm">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <div key={d} role="columnheader" className="pb-1 text-xs text-muted">
                {weekdayName(d, locale, "short").slice(0, 2)}
              </div>
            ))}
            {days.map((iso) => {
              const outside = iso.slice(0, 7) !== month.slice(0, 7);
              const disabled = (min && iso < min) || (max && iso > max);
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  data-date={iso}
                  tabIndex={iso === focus ? 0 : -1}
                  disabled={!!disabled}
                  aria-selected={selected}
                  aria-label={formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, locale)}
                  onClick={() => pick(iso)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    pick(iso);
                  }}
                  className={`tabular rounded-md py-2.5 transition disabled:opacity-25 md:py-1.5 ${
                    selected ? "bg-accent font-semibold text-accent-ink" : outside ? "text-muted hover:bg-surface-2" : "hover:bg-surface-2"
                  } ${iso === today && !selected ? "ring-1 ring-accent/60" : ""}`}
                >
                  {Number(iso.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline disabled:opacity-40"
              disabled={(min && today < min) || (max && today > max) || undefined}
              onClick={() => pick(today)}
            >
              {t("settings.startToday")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
