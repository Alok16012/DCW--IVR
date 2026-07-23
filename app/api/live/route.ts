import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Live call-routing state for the dashboard panel. Returns the most recent
// active (ringing) inbound journey, the attempts made so far with agent names,
// and the routing rule's ordered agents so the UI can render the full sequence
// (ringing / no-answer / queued / next-in-line), plus live agent availability.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: active } = await supabase
    .from("calls")
    .select("*")
    .eq("direction", "inbound")
    .eq("status", "ringing")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, priority, availability, active")
    .order("priority");

  let sequence: {
    agentId: string;
    name: string;
    sequence: number;
    status: string;
    ringSeconds: number | null;
  }[] = [];

  if (active) {
    const [{ data: attempts }, { data: rule }] = await Promise.all([
      supabase.from("call_attempts").select("*").eq("call_id", active.id).order("sequence"),
      active.routing_rule_id
        ? supabase.from("routing_rule_agents").select("agent_id, sequence").eq("rule_id", active.routing_rule_id).order("sequence")
        : Promise.resolve({ data: [] as { agent_id: string; sequence: number }[] }),
    ]);

    const nameById = new Map((agents ?? []).map((a) => [a.id, a.name]));
    const attemptByAgent = new Map((attempts ?? []).map((at) => [at.agent_id, at]));

    sequence = (rule ?? []).map((ra: { agent_id: string; sequence: number }) => {
      const at = attemptByAgent.get(ra.agent_id);
      return {
        agentId: ra.agent_id,
        name: nameById.get(ra.agent_id) ?? "—",
        sequence: ra.sequence,
        status: at?.status ?? "queued",
        ringSeconds: at?.ring_seconds ?? null,
      };
    });
  }

  return NextResponse.json({
    activeCall: active
      ? {
          id: active.id,
          caller: active.caller,
          startedAt: active.started_at,
          attemptsCount: active.attempts_count,
        }
      : null,
    sequence,
    agents: agents ?? [],
  });
}
