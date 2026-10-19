import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { resolveLocale, serverT } from "@/i18n/server";
import { ImportView } from "./import-view";

export async function generateMetadata({ params }: PageProps<"/[lang]/import">): Promise<Metadata> {
  return { title: serverT(await resolveLocale(params))("nav.import") };
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ImportView />
    </Suspense>
  );
}
