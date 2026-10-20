import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, deauthorize, readSession, stravaDisabled } from "@/lib/strava/server";

export async function POST(request: NextRequest) {
  const disabled = stravaDisabled();
  if (disabled) return disabled;
  const session = readSession(request);
  if (session) await deauthorize(session.accessToken);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
