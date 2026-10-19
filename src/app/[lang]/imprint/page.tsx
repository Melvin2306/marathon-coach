import type { Metadata } from "next";
import { Imprint } from "@/content/imprint";
import { pageMetadata, resolveLocale } from "@/i18n/server";

export function generateMetadata({ params }: PageProps<"/[lang]/imprint">): Promise<Metadata> {
  return pageMetadata(params, "/imprint", "legal.imprint", "meta.imprint.description");
}

export default async function Page({ params }: PageProps<"/[lang]/imprint">) {
  return <Imprint locale={await resolveLocale(params)} />;
}
