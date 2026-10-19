import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/server";
import { PaceCalculator } from "./pace-calculator";

export function generateMetadata({ params }: PageProps<"/[lang]/paces">): Promise<Metadata> {
  return pageMetadata(params, "/paces", "paces.title", "meta.paces.description");
}

export default function Page() {
  return <PaceCalculator />;
}
