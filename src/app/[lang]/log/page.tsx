import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { pageMetadata } from "@/i18n/server";
import { LogView } from "./log-view";

export function generateMetadata({ params }: PageProps<"/[lang]/log">): Promise<Metadata> {
  return pageMetadata(params, "/log", "log.title");
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <LogView />
    </Suspense>
  );
}
