import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange } from "@/lib/period";
import type { Call } from "@/lib/types";
import { pct } from "@/lib/utils";

// Dashboard metrics (PRD §10). CRITICAL distinction (§11 "Avoid misleading
// counts"): totals count unique CALL JOURNEYS, never individual agent attempts.
// Attempts are counted separately and the two are never mixed.

export type DashboardKpis = {
  totalCalls: number; // unique journeys
  inbound: number;
  outbound: number;
  answered: number; // unique calls connected to an agent
  missed: number; // inbound journeys with no connection
  answerRate: number; // answered inbound / total inbound
  totalTalkSeconds: number;
  avgTalkSeconds: number;
  totalAttempts: number;
  avgAttempts: number; // attempts / inbound journeys
  pendingCallbacks: number;
  overdueCallbacks: number;
};

export type HourlyPoint = { hour: string; inbound: number; outbound: number };
export type TrendPoint = { day: string; answered: number; missed: number };
export type SplitPoint = { name: string; value: number };
export type TopAgent = {
  agentId: string;
  name: string;
  connected: number;
  talkSeconds: number;
};

export type DashboardData = {
  kpis: DashboardKpis;
  hourly: HourlyPoint[];
  trend: TrendPoint[];
  split: SplitPoint[];
  topAgents: TopAgent[];
};

function isConnected(c: Call): boolean {
  return c.status === "answered" || c.status === "completed"
    ? Boolean(c.connected_agent_id) || c.direction === "outbound"
    : false;
}

export async function getDashboardData(
  db: SupabaseClient,
  range: DateRange,
): Promise<DashboardData> {
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const [{ data: callsRaw }, { count: attemptsCount }, { count: pendingCb }, { count: overdueCb }, { data: agents }] =
    await Promise.all([
      db
        .from("calls")
        .select("*")
        .gte("started_at", fromISO)
        .lte("started_at", toISO)
        .order("started_at", { ascending: false }),
      db
        .from("call_attempts")
        .select("id", { count: "exact", head: true })
        .gte("started_at", fromISO)
        .lte("started_at", toISO),
      db
        .from("callbacks")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "scheduled", "in_progress", "attempted"]),
      db
        .from("callbacks")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "scheduled", "in_progress", "attempted"])
        .lt("due_at", new Date().toISOString()),
      db.from("agents").select("id, name"),
    ]);

  const calls = (callsRaw ?? []) as Call[];
  const inboundCalls = calls.filter((c) => c.direction === "inbound");
  const outboundCalls = calls.filter((c) => c.direction === "outbound");
  const answeredInbound = inboundCalls.filter(isConnected);
  const connectedAll = calls.filter(isConnected);
  const missed = inboundCalls.filter((c) => c.status === "missed" || (c.status === "failed" && !c.connected_agent_id));

  const totalTalk = connectedAll.reduce((s, c) => s + (c.talk_seconds || 0), 0);

  const kpis: DashboardKpis = {
    totalCalls: calls.length,
    inbound: inboundCalls.length,
    outbound: outboundCalls.length,
    answered: connectedAll.length,
    missed: missed.length,
    answerRate: pct(answeredInbound.length, inboundCalls.length),
    totalTalkSeconds: totalTalk,
    avgTalkSeconds: connectedAll.length ? Math.round(totalTalk / connectedAll.length) : 0,
    totalAttempts: attemptsCount ?? 0,
    avgAttempts: inboundCalls.length ? Math.round(((attemptsCount ?? 0) / inboundCalls.length) * 10) / 10 : 0,
    pendingCallbacks: pendingCb ?? 0,
    overdueCallbacks: overdueCb ?? 0,
  };

  // hourly volume (business hours 8..20)
  const hourly: HourlyPoint[] = [];
  for (let h = 8; h <= 20; h++) {
    hourly.push({ hour: `${String(h).padStart(2, "0")}:00`, inbound: 0, outbound: 0 });
  }
  for (const c of calls) {
    const h = new Date(c.started_at).getHours();
    const bucket = hourly.find((x) => x.hour === `${String(h).padStart(2, "0")}:00`);
    if (bucket) {
      if (c.direction === "inbound") bucket.inbound++;
      else bucket.outbound++;
    }
  }

  // answered vs missed trend by day across the range
  const dayMap = new Map<string, TrendPoint>();
  const dayCursor = new Date(range.from);
  dayCursor.setHours(0, 0, 0, 0);
  while (dayCursor <= range.to) {
    const key = dayCursor.toISOString().slice(0, 10);
    dayMap.set(key, {
      day: dayCursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      answered: 0,
      missed: 0,
    });
    dayCursor.setDate(dayCursor.getDate() + 1);
  }
  for (const c of inboundCalls) {
    const key = new Date(c.started_at).toISOString().slice(0, 10);
    const point = dayMap.get(key);
    if (point) {
      if (isConnected(c)) point.answered++;
      else if (c.status === "missed") point.missed++;
    }
  }
  const trend = Array.from(dayMap.values());

  const split: SplitPoint[] = [
    { name: "Inbound", value: inboundCalls.length },
    { name: "Outbound", value: outboundCalls.length },
  ];

  // top agents by connected calls
  const agentName = new Map<string, string>((agents ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));
  const byAgent = new Map<string, TopAgent>();
  for (const c of connectedAll) {
    const aid = c.connected_agent_id;
    if (!aid) continue;
    const entry = byAgent.get(aid) ?? {
      agentId: aid,
      name: agentName.get(aid) ?? "—",
      connected: 0,
      talkSeconds: 0,
    };
    entry.connected++;
    entry.talkSeconds += c.talk_seconds || 0;
    byAgent.set(aid, entry);
  }
  const topAgents = Array.from(byAgent.values())
    .sort((a, b) => b.connected - a.connected)
    .slice(0, 5);

  return { kpis, hourly, trend, split, topAgents };
}
