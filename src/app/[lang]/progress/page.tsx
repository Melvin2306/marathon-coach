import type { Metadata } from "next";
import { resolveLocale, serverT } from "@/i18n/server";
import { ProgressView } from "./progress-view";

export async function generateMetadata({ params }: PageProps<"/[lang]/progress">): Promise<Metadata> {
  return { title: serverT(await resolveLocale(params))("nav.progress") };
}

export default function Page() {
  return <ProgressView />;
}
