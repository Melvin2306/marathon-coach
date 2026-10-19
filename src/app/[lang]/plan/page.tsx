import type { Metadata } from "next";
import { resolveLocale, serverT } from "@/i18n/server";
import { PlanView } from "./plan-view";

export async function generateMetadata({ params }: PageProps<"/[lang]/plan">): Promise<Metadata> {
  return { title: serverT(await resolveLocale(params))("nav.plan") };
}

export default function Page() {
  return <PlanView />;
}
