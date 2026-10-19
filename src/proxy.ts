import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, hasLocale, matchAcceptLanguage } from "./i18n/config";

// Sends locale-less URLs to /en/... or /de/..., preferring the saved choice
// over the browser's Accept-Language.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = hasLocale(saved) ? saved : (matchAcceptLanguage(request.headers.get("accept-language")) ?? DEFAULT_LOCALE);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
