import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange } from "@/lib/period";
import type { Call, CallAttempt } from "@/lib/types";
import { pct } from "@/lib/utils";

// Agent performance report (PRD §11). CRITICAL: inbound "offered" counts agent
// ATTEMPTS, while company-level answered counts unique JOURNEYS. The two are
// computed from different tables and never mixed (§11 "Avoid misleading counts").

export type AgentReportRow = {
  agentId: string;
  name: string;
  inboundAnswered: number; // journeys where this agent became the connected agent
  inboundOffered: number; // routing attempts made to this agent
  inboundMissedByAgent: number; // attempts that ended no_answer/rejected/busy
  outboundInitiated: number;
  outboundConnected: number;
  totalConnected: number; // inboundAnswered + outboundConnected
  talkSeconds: number;
  agentAnswerRate: number; // inboundAnswered / inboundOffered
  callbacksAssigned: number;
  callbacksResolved: number;
  callbackCompletion: number; // resolved / assigned
};

export type ReconciliationSummary = {
  uniqueInboundJourneys: number;
  totalInboundAttempts: number;
  companyAnswered: number;
  companyMissed: number;
};

export type AgentReport = {
  rows: AgentReportRow[];
  reconciliation: ReconciliationSummary;
};

export async function getAgentReport(db: SupabaseClient, range: DateRange): Promise<AgentReport> {
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const [{ data: agents }, { data: callsRaw }, { data: attemptsRaw }, { data: callbacksRaw }] =
    await Promise.all([
      db.from("agents").select("id, name").order("name"),
      db.from("calls").select("*").gte("started_at", fromISO).lte("started_at", toISO),
      db.from("call_attempts").select("*").gte("started_at", fromISO).lte("started_at", toISO),
      db.from("callbacks").select("owner_agent_id, status").gte("created_at", fromISO).lte("created_at", toISO),
    ]);

  const calls = (callsRaw ?? []) as Call[];
  const attempts = (attemptsRaw ?? []) as CallAttempt[];
  const callbacks = (callbacksRaw ?? []) as { owner_agent_id: string | null; status: string }[];

  const rows: AgentReportRow[] = (agents ?? []).map((a: { id: string; name: string }) => {
    const inboundAnswered = calls.filter(
      (c) => c.direction === "inbound" && c.connected_agent_id === a.id && (c.status === "answered" || c.status === "completed"),
    ).length;

    const agentAttempts = attempts.filter((at) => at.agent_id === a.id);
    const inboundOffered = agentAttempts.length;
    const inboundMissedByAgent = agentAttempts.filter((at) =>
      ["no_answer", "rejected", "busy", "failed"].includes(at.status),
    ).length;

    const outboundInitiated = calls.filter((c) => c.direction === "outbound" && c.initiated_by_agent_id === a.id).length;
    const outboundConnected = calls.filter(
      (c) => c.direction === "outbound" && c.initiated_by_agent_id === a.id && (c.status === "answered" || c.status === "completed"),
    ).length;

    const talkSeconds = calls
      .filter((c) => c.connected_agent_id === a.id || c.initiated_by_agent_id === a.id)
      .reduce((s, c) => s + (c.talk_seconds || 0), 0);

    const assigned = callbacks.filter((cb) => cb.owner_agent_id === a.id).length;
    const resolved = callbacks.filter((cb) => cb.owner_agent_id === a.id && cb.status === "resolved").length;

    return {
      agentId: a.id,
      name: a.name,
      inboundAnswered,
      inboundOffered,
      inboundMissedByAgent,
      outboundInitiated,
      outboundConnected,
      totalConnected: inboundAnswered + outboundConnected,
      talkSeconds,
      agentAnswerRate: pct(inboundAnswered, inboundOffered),
      callbacksAssigned: assigned,
      callbacksResolved: resolved,
      callbackCompletion: pct(resolved, assigned),
    };
  });

  const inboundCalls = calls.filter((c) => c.direction === "inbound");
  const reconciliation: ReconciliationSummary = {
    uniqueInboundJourneys: inboundCalls.length,
    totalInboundAttempts: attempts.length,
    companyAnswered: inboundCalls.filter((c) => c.status === "answered" || c.status === "completed").length,
    companyMissed: inboundCalls.filter((c) => c.status === "missed").length,
  };

  return { rows: rows.sort((a, b) => b.totalConnected - a.totalConnected), reconciliation };
}
