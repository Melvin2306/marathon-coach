import { NextResponse, type NextRequest } from "next/server";
import { readSession, stravaConfig } from "@/lib/strava/server";

export function GET(request: NextRequest) {
  const session = readSession(request);
  return NextResponse.json({
    configured: stravaConfig() !== null,
    connected: session !== null,
    athlete: session?.athlete ?? null,
  });
}
