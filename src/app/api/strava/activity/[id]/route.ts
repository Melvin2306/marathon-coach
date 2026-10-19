import { NextResponse, type NextRequest } from "next/server";
import { fetchActivityDetail, withStrava } from "@/lib/strava/server";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/strava/activity/[id]">) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad-id" }, { status: 400 });
  return withStrava(request, async (session) => ({ details: await fetchActivityDetail(session.accessToken, id) }));
}
