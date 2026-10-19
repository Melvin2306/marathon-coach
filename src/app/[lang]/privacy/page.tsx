import type { Metadata } from "next";
import { Privacy } from "@/content/privacy";
import { pageMetadata, resolveLocale } from "@/i18n/server";

export function generateMetadata({ params }: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  return pageMetadata(params, "/privacy", "legal.privacy", "meta.privacy.description");
}

export default async function Page({ params }: PageProps<"/[lang]/privacy">) {
  return <Privacy locale={await resolveLocale(params)} />;
}
