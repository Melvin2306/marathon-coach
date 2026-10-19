import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { pageMetadata } from "@/i18n/server";
import { ImportView } from "./import-view";

export function generateMetadata({ params }: PageProps<"/[lang]/import">): Promise<Metadata> {
  return pageMetadata(params, "/import", "import.title");
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ImportView />
    </Suspense>
  );
}
