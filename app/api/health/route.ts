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
      // which build is actually serving — answers "is my fix live yet?"
      // without guessing from deployment timestamps
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      telephony: { provider: provider.name, live: provider.live },
      webhooks: db === "ok" ? await webhookStats() : null,
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}

/**
 * Delivery stats for the provider webhook (PRD §19: "webhook failure alerts").
 * Aggregates only — no payloads or phone numbers — so this stays safe to expose
 * on the public health check, and makes "is the provider actually calling us?"
 * answerable without database access.
 */
async function webhookStats() {
  try {
    const db = createAdminClient();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: latest }, { count: last24h }, { count: failed24h }] = await Promise.all([
      db
        .from("webhook_events")
        .select("event_type, process_status, received_at")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .gte("received_at", dayAgo),
      db
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .gte("received_at", dayAgo)
        .eq("process_status", "failed"),
    ]);

    return {
      lastEventAt: latest?.received_at ?? null,
      lastEventType: latest?.event_type ?? null,
      lastEventStatus: latest?.process_status ?? null,
      received24h: last24h ?? 0,
      failed24h: failed24h ?? 0,
    };
  } catch {
    return null;
  }
}
