import type { NextRequest } from "next/server";
import { fetchRuns, withStrava } from "@/lib/strava/server";

export function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get("since");
  const after = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? new Date(`${since}T00:00:00Z`) : new Date(Date.now() - 90 * 86_400_000);
  // Start a day early: "after" is UTC, while run dates are local.
  after.setUTCDate(after.getUTCDate() - 1);
  return withStrava(request, async (session) => ({ activities: await fetchRuns(session.accessToken, after) }));
}
