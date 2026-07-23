import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestEvent } from "@/lib/telephony/ingest";
import { rollMockOutcome, mockEventForOutcome, type MockOutcome } from "@/lib/telephony/mock-provider";
import type { TelephonyEvent } from "@/lib/telephony/provider";
import { rateLimit } from "@/lib/rate-limit";

// Advance the currently-ringing call by one attempt, mirroring the sample UI's
// "Simulate next attempt" button. An operator may force an outcome; otherwise
// it's rolled. Routed through ingestEvent so it exercises the same idempotent
// webhook path as a real provider callback (AC-10). Optionally replays the same
// event twice (`duplicate: true`) to demonstrate idempotency.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`simulate:${user.id}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    callId?: string;
    outcome?: MockOutcome;
    replayDuplicate?: boolean;
  };

  const db = createAdminClient();

  // resolve the active ringing call (explicit id or most recent for the org)
  let callId = body.callId;
  if (!callId) {
    const { data: active } = await db
      .from("calls")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("status", "ringing")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    callId = active?.id;
  }
  if (!callId) return NextResponse.json({ error: "no ringing call" }, { status: 404 });

  const { data: call } = await db.from("calls").select("*").eq("id", callId).single();
  const { data: attempt } = await db
    .from("call_attempts")
    .select("*")
    .eq("call_id", callId)
    .eq("status", "ringing")
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "no ringing attempt" }, { status: 404 });

  const outcome = body.outcome ?? rollMockOutcome();
  const event: TelephonyEvent = mockEventForOutcome(outcome, {
    providerCallId: call!.provider_call_id ?? call!.id,
    providerLegId: attempt.provider_leg_id ?? `mock-leg-${attempt.id.slice(0, 8)}`,
    agentId: attempt.agent_id,
    ringSeconds: 8 + Math.floor(Math.random() * 12),
  });

  const raw = JSON.stringify(event);
  const first = await ingestEvent(db, event, raw);

  let duplicate: { ok: boolean; duplicate?: boolean } | null = null;
  if (body.replayDuplicate) {
    duplicate = await ingestEvent(db, event, raw); // same providerEventId → ignored
  }

  // if the agent answered, auto-complete the call after a mock talk duration so
  // reports have talk time (a real provider would send call.completed later).
  if (outcome === "answered") {
    const completeEvent: TelephonyEvent = {
      providerEventId: randomUUID(),
      type: "call.completed",
      providerCallId: call!.provider_call_id ?? call!.id,
      durationSeconds: 45 + Math.floor(Math.random() * 240),
      timestamp: new Date().toISOString(),
    };
    await ingestEvent(db, completeEvent);
  }

  const { data: updated } = await db.from("calls").select("status, attempts_count").eq("id", callId).single();

  return NextResponse.json({
    callId,
    outcome,
    call: updated,
    idempotent: duplicate ? { firstProcessed: !first.duplicate, secondIgnored: duplicate.duplicate } : undefined,
  });
}
