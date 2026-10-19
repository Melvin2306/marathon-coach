import type { NextRequest } from "next/server";
import { fetchAthlete, withStrava } from "@/lib/strava/server";

export function GET(request: NextRequest) {
  return withStrava(request, async (session) => ({ athlete: await fetchAthlete(session.accessToken, session.scope ?? "") }));
}
