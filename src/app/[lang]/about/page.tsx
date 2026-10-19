import type { Metadata } from "next";
import { About } from "@/content/about";
import { pageMetadata, resolveLocale } from "@/i18n/server";

export function generateMetadata({ params }: PageProps<"/[lang]/about">): Promise<Metadata> {
  return pageMetadata(params, "/about", "meta.about.title", "meta.about.description");
}

export default async function Page({ params }: PageProps<"/[lang]/about">) {
  return <About locale={await resolveLocale(params)} />;
}
