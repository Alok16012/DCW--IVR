import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/telephony";
import { ingestEvent } from "@/lib/telephony/ingest";
import type { TelephonyEvent } from "@/lib/telephony/provider";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  customerNumber: z.string().min(6).max(24),
  callbackId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
});

// Tracked click-to-call outbound (PRD §7.2, AC-07). The completed call is
// attributed to the initiating agent and appears in their reports.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // per-user rate limit — prevents accidental double-clicks / abuse (PRD §17)
  const rl = rateLimit(`outbound:${user.id}`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "too many calls, slow down" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const db = createAdminClient();

  // determine the initiating agent: the caller's own agent row, or (for
  // managers/admins placing a callback) an explicit agentId.
  let agentId = parsed.data.agentId ?? null;
  if (!agentId) {
    const { data: agent } = await db
      .from("agents")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    agentId = agent?.id ?? null;
  }
  if (!agentId) {
    return NextResponse.json({ error: "no initiating agent resolved" }, { status: 400 });
  }

  const { data: agent } = await db.from("agents").select("*").eq("id", agentId).single();
  if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  const providerCallId = `mock-out-${randomUUID().slice(0, 12)}`;

  // create the outbound call attributed to the initiating agent
  const { data: call } = await db
    .from("calls")
    .insert({
      organization_id: profile.organization_id,
      provider_call_id: providerCallId,
      direction: "outbound",
      caller: agent.phone,
      destination: parsed.data.customerNumber,
      status: "initiated",
      initiated_by_agent_id: agentId,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  // ask provider to place the call
  const result = await getProvider().initiateOutbound({
    callId: call!.id,
    agentId,
    agentPhone: agent.phone,
    customerNumber: parsed.data.customerNumber,
    callerId: agent.phone,
  });

  // mock provider: immediately simulate a connected + completed outbound call so
  // it lands in reports. A real provider sends these via webhook over time.
  const connected = Math.random() > 0.15;
  if (getProvider().name === "mock") {
    if (connected) {
      await db
        .from("calls")
        .update({ status: "answered", connected_at: new Date().toISOString(), connected_agent_id: agentId })
        .eq("id", call!.id);
      const completeEvent: TelephonyEvent = {
        providerEventId: randomUUID(),
        type: "call.completed",
        providerCallId,
        durationSeconds: 40 + Math.floor(Math.random() * 200),
        timestamp: new Date().toISOString(),
      };
      await ingestEvent(db, completeEvent);
    } else {
      await db.from("calls").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", call!.id);
    }
  }

  // if this was a callback, mark it attempted/resolved
  if (parsed.data.callbackId) {
    await db
      .from("callbacks")
      .update({
        status: connected ? "resolved" : "attempted",
        outcome: connected ? "connected" : "no_answer",
        attempts: (await getAttempts(db, parsed.data.callbackId)) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.callbackId);
  }

  return NextResponse.json({ callId: call!.id, accepted: result.accepted, connected });
}

async function getAttempts(db: ReturnType<typeof createAdminClient>, callbackId: string): Promise<number> {
  const { data } = await db.from("callbacks").select("attempts").eq("id", callbackId).single();
  return data?.attempts ?? 0;
}
