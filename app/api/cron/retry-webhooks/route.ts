import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyTelephonyEvent } from "@/lib/routing/engine";
import type { TelephonyEvent } from "@/lib/telephony/provider";
import { authorizeCron } from "@/lib/cron";

// Retry queue (PRD §15 "Failed processing goes to a retry queue" / §17
// Reliability). Reprocesses webhook events left in `failed` state — the stored
// normalized payload is re-applied without re-inserting (so idempotency holds).
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const db = createAdminClient();
  const { data: failed } = await db
    .from("webhook_events")
    .select("provider_event_id, payload")
    .eq("process_status", "failed")
    .order("received_at")
    .limit(50);

  let processed = 0;
  let stillFailing = 0;

  for (const ev of failed ?? []) {
    try {
      await applyTelephonyEvent(db, ev.payload as TelephonyEvent);
      await db
        .from("webhook_events")
        .update({ process_status: "processed", processed_at: new Date().toISOString(), error: null })
        .eq("provider_event_id", ev.provider_event_id);
      processed++;
    } catch (err) {
      await db
        .from("webhook_events")
        .update({ error: (err as Error).message })
        .eq("provider_event_id", ev.provider_event_id);
      stillFailing++;
    }
  }

  return NextResponse.json({ ok: true, retried: (failed ?? []).length, processed, stillFailing });
}
