import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/server";
import { PlanView } from "./plan-view";

export function generateMetadata({ params }: PageProps<"/[lang]/plan">): Promise<Metadata> {
  return pageMetadata(params, "/plan", "plan.title", "meta.plan.description");
}

export default function Page() {
  return <PlanView />;
}
