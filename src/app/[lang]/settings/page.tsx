import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/server";
import { SettingsForm } from "./settings-form";

export function generateMetadata({ params }: PageProps<"/[lang]/settings">): Promise<Metadata> {
  return pageMetadata(params, "/settings", "nav.settings");
}

export default function Page() {
  return <SettingsForm />;
}
