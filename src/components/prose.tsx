import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/dates";
import { LEGAL_UPDATED, OPERATOR } from "@/lib/site";

/** Long-form text styles for the About and legal pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl text-[15px] leading-relaxed text-ink-2 [&_a]:font-medium [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-ink [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:font-medium [&_h3]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      {children}
    </article>
  );
}

export function OperatorAddress({ locale }: { locale: Locale }) {
  return (
    <address className="mt-3 not-italic">
      {OPERATOR.name}
      <br />
      {OPERATOR.careOf}
      <br />
      {OPERATOR.street}
      <br />
      {OPERATOR.city}
      <br />
      {OPERATOR.country[locale]}
      <br />
      <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
    </address>
  );
}

export function Updated({ locale }: { locale: Locale }) {
  const date = formatDate(LEGAL_UPDATED, { day: "numeric", month: "long", year: "numeric" }, locale);
  return <p className="mt-10 text-sm text-muted">{locale === "de" ? `Stand: ${date}` : `Last updated: ${date}`}</p>;
}
