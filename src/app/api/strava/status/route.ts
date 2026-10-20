import { NextResponse, type NextRequest } from "next/server";
import { readSession, stravaConfig, stravaDisabled } from "@/lib/strava/server";

export function GET(request: NextRequest) {
  const disabled = stravaDisabled();
  if (disabled) return disabled;
  const session = readSession(request);
  return NextResponse.json({
    configured: stravaConfig() !== null,
    connected: session !== null,
    athlete: session?.athlete ?? null,
  });
}
