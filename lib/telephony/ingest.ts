import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyTelephonyEvent } from "@/lib/routing/engine";
import type { TelephonyEvent } from "./provider";

/**
 * Idempotent ingestion of a normalized telephony event. Shared by the real
 * webhook handler and the mock simulator so both exercise the exact same
 * idempotency + state-machine path (AC-10).
 * Returns { duplicate: true } when the event was already processed.
 */
export async function ingestEvent(
  db: SupabaseClient,
  event: TelephonyEvent,
  rawForHash?: string,
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const payloadHash = createHash("sha256")
    .update(rawForHash ?? JSON.stringify(event))
    .digest("hex");

  const { error: insertErr } = await db.from("webhook_events").insert({
    provider_event_id: event.providerEventId,
    event_type: event.type,
    payload_hash: payloadHash,
    payload: event.raw ?? (event as unknown as Record<string, unknown>),
    process_status: "received",
  });

  if (insertErr) {
    if (insertErr.code === "23505") return { ok: true, duplicate: true };
    return { ok: false, error: insertErr.message };
  }

  try {
    await applyTelephonyEvent(db, event);
    await db
      .from("webhook_events")
      .update({ process_status: "processed", processed_at: new Date().toISOString() })
      .eq("provider_event_id", event.providerEventId);
    return { ok: true };
  } catch (err) {
    await db
      .from("webhook_events")
      .update({ process_status: "failed", error: (err as Error).message })
      .eq("provider_event_id", event.providerEventId);
    return { ok: false, error: (err as Error).message };
  }
}
