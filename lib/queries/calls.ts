import type { SupabaseClient } from "@supabase/supabase-js";
import type { Call } from "@/lib/types";

export type CallFilters = {
  search?: string;
  direction?: string;
  status?: string;
  agentId?: string;
  teamId?: string;
  disposition?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type CallListResult = {
  calls: Call[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listCalls(db: SupabaseClient, filters: CallFilters): Promise<CallListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const fromIdx = (page - 1) * pageSize;

  let q = db.from("calls").select("*", { count: "exact" });

  if (filters.direction) q = q.eq("direction", filters.direction);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.agentId) q = q.or(`connected_agent_id.eq.${filters.agentId},initiated_by_agent_id.eq.${filters.agentId}`);
  if (filters.from) q = q.gte("started_at", filters.from);
  if (filters.to) q = q.lte("started_at", filters.to);
  if (filters.search) {
    const s = filters.search.replace(/[%,]/g, "");
    q = q.or(`caller.ilike.%${s}%,destination.ilike.%${s}%`);
  }

  q = q.order("started_at", { ascending: false }).range(fromIdx, fromIdx + pageSize - 1);

  const { data, count } = await q;
  return { calls: (data ?? []) as Call[], total: count ?? 0, page, pageSize };
}

export type CallDetail = {
  call: Call;
  attempts: {
    id: string;
    sequence: number;
    agent_id: string | null;
    agent_name: string | null;
    status: string;
    ring_seconds: number | null;
    started_at: string;
    ended_at: string | null;
  }[];
  notes: { id: string; note: string | null; disposition: string | null; tags: string[]; author: string | null; created_at: string }[];
  recording: { provider_ref: string | null; duration: number | null } | null;
  callback: { id: string; status: string; priority: string; due_at: string } | null;
  connectedAgentName: string | null;
  initiatedByName: string | null;
};

export async function getCallDetail(db: SupabaseClient, callId: string): Promise<CallDetail | null> {
  const { data: call } = await db.from("calls").select("*").eq("id", callId).maybeSingle();
  if (!call) return null;

  const [{ data: attempts }, { data: notes }, { data: recording }, { data: callback }, { data: agents }] =
    await Promise.all([
      db.from("call_attempts").select("*").eq("call_id", callId).order("sequence"),
      db.from("call_notes").select("*").eq("call_id", callId).order("created_at", { ascending: false }),
      db.from("recordings").select("*").eq("call_id", callId).maybeSingle(),
      db.from("callbacks").select("id, status, priority, due_at").eq("call_id", callId).maybeSingle(),
      db.from("agents").select("id, name"),
      db.from("profiles").select("id, name"),
    ]);

  const agentName = new Map((agents ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));

  const { data: profiles } = await db.from("profiles").select("id, name");
  const profileName = new Map((profiles ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));

  return {
    call: call as Call,
    attempts: (attempts ?? []).map((a) => ({
      id: a.id,
      sequence: a.sequence,
      agent_id: a.agent_id,
      agent_name: a.agent_id ? agentName.get(a.agent_id) ?? null : null,
      status: a.status,
      ring_seconds: a.ring_seconds,
      started_at: a.started_at,
      ended_at: a.ended_at,
    })),
    notes: (notes ?? []).map((n) => ({
      id: n.id,
      note: n.note,
      disposition: n.disposition,
      tags: n.tags ?? [],
      author: n.author_id ? profileName.get(n.author_id) ?? null : null,
      created_at: n.created_at,
    })),
    recording: recording ? { provider_ref: recording.provider_ref, duration: recording.duration } : null,
    callback: callback ?? null,
    connectedAgentName: call.connected_agent_id ? agentName.get(call.connected_agent_id) ?? null : null,
    initiatedByName: call.initiated_by_agent_id ? agentName.get(call.initiated_by_agent_id) ?? null : null,
  };
}
