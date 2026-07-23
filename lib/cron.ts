import { NextRequest, NextResponse } from "next/server";

/**
 * Guard a cron route. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * when CRON_SECRET is set in the project env. We reject anything else so these
 * maintenance endpoints cannot be triggered by the public.
 */
export function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
