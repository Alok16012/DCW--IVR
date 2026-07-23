import type { SupabaseClient } from "@supabase/supabase-js";
import { getProvider } from "@/lib/telephony";
import type { TelephonyEvent } from "@/lib/telephony/provider";
import type { Agent, BusinessNumber, RoutingRule, RoutingRuleAgent } from "@/lib/types";
import { buildEligibleSequence, rotate, type EligibleAgent } from "./eligibility";
import { evaluateOfficeHours } from "./office-hours";

// The routing engine orchestrates a call journey across agent legs (PRD §7–8).
// It is deliberately provider-agnostic: it asks the active TelephonyProvider to
// ring agents and reacts to normalized events. All state lives in Postgres so
// the journey is fully reconstructable (attempt timeline, AC-05).
//
// Runs with the service-role client (bypasses RLS) because it acts on behalf of
// the system, not a signed-in user.

type DB = SupabaseClient;

const PRIORITY_BY_SEQUENCE = (seq: number): "high" | "medium" | "low" =>
  seq <= 1 ? "high" : seq <= 3 ? "medium" : "low";

async function loadRoutingContext(db: DB, orgId: string, ruleId: string) {
  const [{ data: rule }, { data: ruleAgentsRaw }, { data: agentsRaw }] = await Promise.all([
    db.from("routing_rules").select("*").eq("id", ruleId).single(),
    db.from("routing_rule_agents").select("*").eq("rule_id", ruleId).order("sequence"),
    db.from("agents").select("*").eq("organization_id", orgId),
  ]);

  const agentsById = new Map<string, Agent>((agentsRaw ?? []).map((a: Agent) => [a.id, a]));
  return {
    rule: rule as RoutingRule | null,
    ruleAgents: (ruleAgentsRaw ?? []) as RoutingRuleAgent[],
    agentsById,
  };
}

/** Agents currently on a live platform call — used to skip busy agents (§8 concurrency). */
async function busyAgentIds(db: DB, orgId: string): Promise<Set<string>> {
  const { data } = await db
    .from("calls")
    .select("connected_agent_id")
    .eq("organization_id", orgId)
    .in("status", ["answered", "ringing", "routing"])
    .not("connected_agent_id", "is", null);
  return new Set((data ?? []).map((c: { connected_agent_id: string }) => c.connected_agent_id));
}

export type StartJourneyInput = {
  organizationId: string;
  caller: string;
  businessNumberId?: string | null;
  providerCallId?: string | null;
  routingRuleId?: string | null;
};

export type StartJourneyResult = {
  callId: string;
  outcome: "ringing" | "missed_closed" | "missed_no_agents";
  eligible: EligibleAgent[];
  firstAttemptId?: string;
};

/**
 * Begin an inbound call journey (PRD §7.1). Checks office hours, computes the
 * eligible ring sequence, creates the call + first attempt, and rings agent 1.
 */
export async function startCallJourney(
  db: DB,
  input: StartJourneyInput,
): Promise<StartJourneyResult> {
  const orgId = input.organizationId;

  const { data: org } = await db.from("organizations").select("*").eq("id", orgId).single();
  const timezone = org?.timezone ?? "Asia/Kolkata";

  // resolve the routing rule (from the business number if not given)
  let ruleId = input.routingRuleId ?? null;
  let businessNumberId = input.businessNumberId ?? null;
  if (!ruleId && businessNumberId) {
    const { data: bn } = await db
      .from("business_numbers")
      .select("*")
      .eq("id", businessNumberId)
      .single();
    ruleId = (bn as BusinessNumber | null)?.routing_rule_id ?? null;
  }
  if (!ruleId) {
    const { data: rule } = await db
      .from("routing_rules")
      .select("id")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .single();
    ruleId = rule?.id ?? null;
  }

  // office-hours / holiday gate (§7.4)
  const [{ data: hours }, { data: holidays }] = await Promise.all([
    db.from("business_hours").select("*").eq("organization_id", orgId),
    db.from("holidays").select("*").eq("organization_id", orgId),
  ]);
  const office = evaluateOfficeHours(new Date(), timezone, hours ?? [], holidays ?? []);

  // create the call row
  const { data: call } = await db
    .from("calls")
    .insert({
      organization_id: orgId,
      provider_call_id: input.providerCallId ?? null,
      direction: "inbound",
      caller: input.caller,
      business_number_id: businessNumberId,
      routing_rule_id: ruleId,
      status: office.open ? "routing" : "missed",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  const callId = call!.id as string;

  if (!office.open) {
    // Outside hours / holiday: log missed + create one callback (§7.4)
    await createCallbackForMissed(db, orgId, callId, input.caller, ruleId);
    await db.from("calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", callId);
    return { callId, outcome: "missed_closed", eligible: [] };
  }

  // build eligible sequence
  if (!ruleId) {
    await createCallbackForMissed(db, orgId, callId, input.caller, null);
    await db.from("calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", callId);
    return { callId, outcome: "missed_no_agents", eligible: [] };
  }

  const { rule, ruleAgents, agentsById } = await loadRoutingContext(db, orgId, ruleId);
  const busy = await busyAgentIds(db, orgId);
  let eligible = buildEligibleSequence(ruleAgents, agentsById, { now: new Date(), busyAgentIds: busy });

  // Round-robin (PRD §8/§24): rotate the start of the sequence per call so the
  // load spreads across agents instead of always starting at priority 1. Offset
  // is derived statelessly from the number of inbound journeys started today.
  if (rule?.mode === "round_robin" && eligible.length > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await db
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("direction", "inbound")
      .gte("started_at", startOfDay.toISOString());
    eligible = rotate(eligible, count ?? 0);
  }

  if (eligible.length === 0) {
    await createCallbackForMissed(db, orgId, callId, input.caller, ruleId);
    await db.from("calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", callId);
    return { callId, outcome: "missed_no_agents", eligible: [] };
  }

  const first = eligible[0];
  const attemptId = await createAttempt(db, orgId, callId, first, 1);
  await db.from("calls").update({ status: "ringing", attempts_count: 1 }).eq("id", callId);

  // ask provider to ring agent 1
  await getProvider().ringAgent({
    callId,
    attemptId,
    agentId: first.agent.id,
    agentPhone: first.agent.phone,
    customerNumber: input.caller,
    timeoutSeconds: first.timeout,
  });

  return { callId, outcome: "ringing", eligible, firstAttemptId: attemptId };
}

async function createAttempt(
  db: DB,
  orgId: string,
  callId: string,
  eligible: EligibleAgent,
  sequence: number,
): Promise<string> {
  const { data } = await db
    .from("call_attempts")
    .insert({
      organization_id: orgId,
      call_id: callId,
      agent_id: eligible.agent.id,
      sequence,
      status: "ringing",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  // reflect ringing availability on the agent
  await db.from("agents").update({ availability: "busy" }).eq("id", eligible.agent.id);
  return data!.id as string;
}

/**
 * Advance the journey after an attempt resolves (PRD §7.1 steps 5–9, §8).
 * Given the just-finished attempt outcome, either answer-lock or ring the next
 * eligible agent; on exhaustion mark missed + create exactly one callback.
 */
export async function advanceJourney(
  db: DB,
  callId: string,
  finishedAttemptId: string,
  outcome: "answered" | "no_answer" | "busy" | "rejected" | "failed",
  meta?: { ringSeconds?: number },
): Promise<{ status: string }> {
  const { data: call } = await db.from("calls").select("*").eq("id", callId).single();
  if (!call) return { status: "unknown" };
  const orgId = call.organization_id as string;

  const { data: attempt } = await db
    .from("call_attempts")
    .select("*")
    .eq("id", finishedAttemptId)
    .single();

  // record the outcome on the finished attempt
  await db
    .from("call_attempts")
    .update({
      status: outcome === "answered" ? "answered" : outcome,
      ring_seconds: meta?.ringSeconds ?? attempt?.ring_seconds ?? null,
      ended_at: new Date().toISOString(),
    })
    .eq("id", finishedAttemptId);

  // free the agent we just tried (unless they answered)
  if (attempt?.agent_id && outcome !== "answered") {
    await db.from("agents").update({ availability: "available" }).eq("id", attempt.agent_id);
  }

  if (outcome === "answered") {
    // ANSWER LOCK (§8): stop everything, set connected agent
    await db
      .from("calls")
      .update({
        status: "answered",
        connected_agent_id: attempt?.agent_id ?? null,
        connected_at: new Date().toISOString(),
      })
      .eq("id", callId);
    // cancel any still-queued attempts
    await db
      .from("call_attempts")
      .update({ status: "cancelled", ended_at: new Date().toISOString() })
      .eq("call_id", callId)
      .eq("status", "queued");
    return { status: "answered" };
  }

  // otherwise advance to next eligible agent
  const ruleId = call.routing_rule_id as string | null;
  if (!ruleId) return finalizeMissed(db, orgId, callId, call.caller, ruleId);

  const { rule, ruleAgents, agentsById } = await loadRoutingContext(db, orgId, ruleId);
  const busy = await busyAgentIds(db, orgId);
  const eligible = buildEligibleSequence(ruleAgents, agentsById, { now: new Date(), busyAgentIds: busy });

  // which agents have we already tried this journey? (repeat prevention §8)
  const { data: priorAttempts } = await db
    .from("call_attempts")
    .select("agent_id, sequence")
    .eq("call_id", callId);
  const triedAgentIds = new Set(
    (priorAttempts ?? []).map((a: { agent_id: string }) => a.agent_id).filter(Boolean),
  );
  const attemptsSoFar = (priorAttempts ?? []).length;

  const maxAttempts = rule?.max_attempts ?? eligible.length;
  if (attemptsSoFar >= maxAttempts) {
    return finalizeMissed(db, orgId, callId, call.caller, ruleId);
  }

  const next = eligible.find((e) => rule?.allow_repeat || !triedAgentIds.has(e.agent.id));
  if (!next) {
    return finalizeMissed(db, orgId, callId, call.caller, ruleId);
  }

  const nextSeq = attemptsSoFar + 1;
  const nextAttemptId = await createAttempt(db, orgId, callId, next, nextSeq);
  await db
    .from("calls")
    .update({ status: "ringing", attempts_count: nextSeq })
    .eq("id", callId);

  await getProvider().ringAgent({
    callId,
    attemptId: nextAttemptId,
    agentId: next.agent.id,
    agentPhone: next.agent.phone,
    customerNumber: call.caller,
    timeoutSeconds: next.timeout,
  });

  return { status: "ringing" };
}

async function finalizeMissed(
  db: DB,
  orgId: string,
  callId: string,
  caller: string,
  ruleId: string | null,
): Promise<{ status: string }> {
  await db
    .from("calls")
    .update({ status: "missed", ended_at: new Date().toISOString() })
    .eq("id", callId);
  await createCallbackForMissed(db, orgId, callId, caller, ruleId);
  return { status: "missed" };
}

/**
 * Create exactly ONE callback task for a missed journey (PRD §7.3 rule 15).
 * The unique index on callbacks(call_id) guarantees idempotency even under
 * duplicate webhook delivery (AC-10).
 */
export async function createCallbackForMissed(
  db: DB,
  orgId: string,
  callId: string,
  caller: string,
  ruleId: string | null,
): Promise<void> {
  // pick the fallback owner if configured (§7.3 rule 16)
  let ownerAgentId: string | null = null;
  let teamId: string | null = null;
  const { data: fallback } = await db
    .from("agents")
    .select("id, team_id")
    .eq("organization_id", orgId)
    .eq("fallback_owner", true)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (fallback) {
    ownerAgentId = fallback.id;
    teamId = fallback.team_id;
  }

  const { count } = await db
    .from("call_attempts")
    .select("id", { count: "exact", head: true })
    .eq("call_id", callId);
  const priority = PRIORITY_BY_SEQUENCE(count ?? 1);

  // upsert-guard: unique index prevents duplicates; ignore conflict
  await db.from("callbacks").insert({
    organization_id: orgId,
    call_id: callId,
    caller,
    owner_agent_id: ownerAgentId,
    team_id: teamId,
    priority,
    status: "open",
    due_at: new Date().toISOString(),
  }).select("id").maybeSingle();

  // optional manager notification flag (§8 fallback)
  if (ruleId) {
    const { data: rule } = await db.from("routing_rules").select("notify_manager_on_miss").eq("id", ruleId).single();
    if (rule?.notify_manager_on_miss) {
      await db.from("audit_logs").insert({
        organization_id: orgId,
        actor_name: "system",
        action: "notify.manager.missed_call",
        entity: "call",
        entity_id: callId,
        new_values: { caller },
      });
    }
  }
}

/**
 * Apply a normalized telephony event to the journey state machine. Called by
 * the webhook handler after idempotency + signature checks pass.
 */
export async function applyTelephonyEvent(db: DB, event: TelephonyEvent): Promise<void> {
  // find the call + latest ringing attempt for this leg
  const { data: call } = await db
    .from("calls")
    .select("*")
    .or(
      `provider_call_id.eq.${event.providerCallId},id.eq.${event.providerCallId}`,
    )
    .maybeSingle();
  if (!call) return;

  const { data: attempt } = await db
    .from("call_attempts")
    .select("*")
    .eq("call_id", call.id)
    .eq("status", "ringing")
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();

  switch (event.type) {
    case "leg.answered":
      if (attempt) await advanceJourney(db, call.id, attempt.id, "answered", { ringSeconds: event.ringSeconds });
      break;
    case "leg.no_answer":
      if (attempt) await advanceJourney(db, call.id, attempt.id, "no_answer", { ringSeconds: event.ringSeconds });
      break;
    case "leg.busy":
      if (attempt) await advanceJourney(db, call.id, attempt.id, "busy", { ringSeconds: event.ringSeconds });
      break;
    case "leg.rejected":
      if (attempt) await advanceJourney(db, call.id, attempt.id, "rejected", { ringSeconds: event.ringSeconds });
      break;
    case "leg.failed":
      if (attempt) await advanceJourney(db, call.id, attempt.id, "failed", { ringSeconds: event.ringSeconds });
      break;
    case "call.completed": {
      const talk = event.durationSeconds ?? call.talk_seconds ?? 0;
      await db
        .from("calls")
        .update({
          status: "completed",
          talk_seconds: talk,
          ended_at: new Date().toISOString(),
        })
        .eq("id", call.id);
      if (call.connected_agent_id) {
        await db.from("agents").update({ availability: "available" }).eq("id", call.connected_agent_id);
      }
      if (event.recordingRef) {
        await db.from("recordings").insert({
          organization_id: call.organization_id,
          call_id: call.id,
          provider_ref: event.recordingRef,
          duration: talk,
        });
      }
      break;
    }
    case "call.failed":
      await db.from("calls").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", call.id);
      break;
  }
}
