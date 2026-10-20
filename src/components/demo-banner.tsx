"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { resetData, useAppData } from "@/lib/store";

/** Shown on every page while the demo athlete's data is loaded. */
export function DemoBanner() {
  const data = useAppData();
  const { t, href } = useI18n();
  const router = useRouter();
  if (!data?.demo) return null;
  return (
    <div role="status" className="mb-6 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
      <p className="flex-1 text-ink-2">
        <span className="font-semibold text-ink">{t("demo.title")}</span> · {t("demo.body")}
      </p>
      <button
        type="button"
        className="btn-ghost shrink-0 self-start sm:self-auto"
        onClick={() => {
          resetData();
          router.push(href("/"));
        }}
      >
        {t("demo.exit")}
      </button>
    </div>
  );
}
