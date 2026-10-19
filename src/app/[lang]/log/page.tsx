import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { resolveLocale, serverT } from "@/i18n/server";
import { LogView } from "./log-view";

export async function generateMetadata({ params }: PageProps<"/[lang]/log">): Promise<Metadata> {
  return { title: serverT(await resolveLocale(params))("nav.log") };
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <LogView />
    </Suspense>
  );
}
