import type { Metadata } from "next";
import { resolveLocale, serverT } from "@/i18n/server";
import { SettingsForm } from "./settings-form";

export async function generateMetadata({ params }: PageProps<"/[lang]/settings">): Promise<Metadata> {
  return { title: serverT(await resolveLocale(params))("nav.settings") };
}

export default function Page() {
  return <SettingsForm />;
}
