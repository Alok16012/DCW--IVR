import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/telephony";

// Health check for uptime monitoring (PRD §19 monitoring). Verifies the app is
// up and the database is reachable, and reports the active telephony provider.
export async function GET() {
  const started = Date.now();
  let db: "ok" | "error" = "ok";
  try {
    const client = createAdminClient();
    const { error } = await client.from("organizations").select("id", { count: "exact", head: true });
    if (error) db = "error";
  } catch {
    db = "error";
  }

  const provider = getProvider();
  const healthy = db === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      db,
      telephony: { provider: provider.name, live: provider.live },
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
