import type { Metadata } from "next";
import { resolveLocale, serverT } from "@/i18n/server";
import { PaceCalculator } from "./pace-calculator";

export async function generateMetadata({ params }: PageProps<"/[lang]/paces">): Promise<Metadata> {
  return { title: serverT(await resolveLocale(params))("nav.paces") };
}

export default function Page() {
  return <PaceCalculator />;
}
