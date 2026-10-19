import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, hasLocale } from "@/i18n/config";
import { STATE_COOKIE, exchangeCode, writeSession } from "@/lib/strava/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const [expected, savedLocale] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split(":");
  const locale = hasLocale(savedLocale) ? savedLocale : DEFAULT_LOCALE;
  const done = (status: string) => {
    const response = NextResponse.redirect(new URL(`/${locale}/import?strava=${status}`, request.url));
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/strava" });
    return response;
  };

  if (!expected || params.get("state") !== expected) return done("error");
  if (params.get("error")) return done("denied");
  const scope = params.get("scope") ?? "";
  const code = params.get("code");
  if (!code || !scope.includes("activity:read")) return done("denied");

  try {
    const session = await exchangeCode(code, scope);
    const response = done("connected");
    writeSession(request, response, session);
    return response;
  } catch {
    return done("error");
  }
}
