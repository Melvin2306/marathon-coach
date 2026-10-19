import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/server";
import { ProgressView } from "./progress-view";

export function generateMetadata({ params }: PageProps<"/[lang]/progress">): Promise<Metadata> {
  return pageMetadata(params, "/progress", "nav.progress", "meta.progress.description");
}

export default function Page() {
  return <ProgressView />;
}
