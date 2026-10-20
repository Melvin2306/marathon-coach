import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, hasLocale } from "@/i18n/config";
import { STATE_COOKIE, callbackUrl, stravaConfig, stravaDisabled } from "@/lib/strava/server";

export function GET(request: NextRequest) {
  const disabled = stravaDisabled();
  if (disabled) return disabled;
  const lang = request.nextUrl.searchParams.get("lang") ?? undefined;
  const locale = hasLocale(lang) ? lang : DEFAULT_LOCALE;
  const config = stravaConfig();
  if (!config) return NextResponse.redirect(new URL(`/${locale}/import?strava=unconfigured`, request.url));

  const state = crypto.randomUUID();
  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl(request));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("approval_prompt", "auto");
  // Activities for runs; profile for shoes and running totals.
  authorize.searchParams.set("scope", "read,activity:read_all,profile:read_all");
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, `${state}:${locale}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/strava",
    maxAge: 600,
  });
  return response;
}
