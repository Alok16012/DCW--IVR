import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushLeadToCrm } from "@/lib/crm/push-lead";

// One-time (re-runnable) backfill: push calls already recorded here into the
// CRM as leads. The live sync only covers calls that arrive from now on, so
// every caller from before the integration went in would otherwise be missing
// from the counsellors' lead lists.
//
// Defaults to the two agents who actually take calls — Aditi and Purnima — so
// each of them ends up with their own historic callers. Override with ?agents=.
//
// Safe to run twice: the CRM matches on the caller's last 10 digits and
// updates the existing lead instead of creating a duplicate.

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_AGENTS = ["aditi", "purnima"];

/** Constant-time check of the operator key, from a header or ?key=. */
function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const supplied =
    req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("key");
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const last10 = (s: string) => s.replace(/\D/g, "").slice(-10);

type CallRow = {
  id: string;
  caller: string | null;
  direction: string | null;
  status: string | null;
  talk_seconds: number | null;
  started_at: string | null;
  destination: string | null;
  provider_call_id: string | null;
  provider_agent_name: string | null;
  provider_agent_phone: string | null;
  connected_agent_id: string | null;
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.CRM_LEAD_WEBHOOK_URL || !process.env.CRM_LEAD_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "CRM_LEAD_WEBHOOK_URL / CRM_LEAD_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const wanted = (req.nextUrl.searchParams.get("agents") ?? DEFAULT_AGENTS.join(","))
    .split(",")
    .map((s) => normalize(s))
    .filter(Boolean);
  // Preview by default — nothing is sent unless the caller asks to commit, so a
  // mistyped agent name can't spray hundreds of leads into the CRM.
  const commit = req.nextUrl.searchParams.get("commit") === "true";

  const db = createAdminClient();

  // Agent identity lives in two places: our own roster (connected_agent_id) for
  // engine-routed calls, and the provider's own name for Buzzdial-routed ones.
  const { data: agentRows } = await db.from("agents").select("id, name, phone");
  const agentById = new Map<string, { name: string; phone: string | null }>(
    (agentRows ?? []).map((a: { id: string; name: string; phone: string | null }) => [
      a.id,
      { name: a.name, phone: a.phone },
    ]),
  );

  const { data: calls, error } = await db
    .from("calls")
    .select(
      "id, caller, direction, status, talk_seconds, started_at, destination, provider_call_id, provider_agent_name, provider_agent_phone, connected_agent_id",
    )
    .order("started_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Newest call per caller wins: one lead per number, carrying the most recent
  // agent and outcome. Calls are already sorted newest-first.
  const byCaller = new Map<string, { call: CallRow; agentName: string; agentPhone: string | null }>();
  let scanned = 0;
  let skippedNoAgentMatch = 0;

  for (const raw of (calls ?? []) as CallRow[]) {
    scanned++;
    if (!raw.caller) continue;
    const phone = last10(raw.caller);
    if (phone.length !== 10) continue;

    const roster = raw.connected_agent_id ? agentById.get(raw.connected_agent_id) : undefined;
    const agentName = raw.provider_agent_name ?? roster?.name ?? null;
    if (!agentName) continue;

    const norm = normalize(agentName);
    // "aditi" matches "Aditi", "Aditi Krishan", "aditi_dcw"
    const isWanted = wanted.some((w) => norm.includes(w) || w.includes(norm));
    if (!isWanted) {
      skippedNoAgentMatch++;
      continue;
    }

    if (!byCaller.has(phone)) {
      byCaller.set(phone, {
        call: raw,
        agentName,
        agentPhone: raw.provider_agent_phone ?? roster?.phone ?? null,
      });
    }
  }

  const targets = [...byCaller.entries()];

  if (!commit) {
    return NextResponse.json({
      dryRun: true,
      hint: "re-run with &commit=true to actually push these to the CRM",
      agentsMatched: wanted,
      callsScanned: scanned,
      callsSkippedOtherAgents: skippedNoAgentMatch,
      leadsWouldPush: targets.length,
      byAgent: countByAgent(targets),
      sample: targets.slice(0, 10).map(([phone, t]) => ({
        phone: `${phone.slice(0, 2)}****${phone.slice(-2)}`,
        agent: t.agentName,
        status: t.call.status,
        at: t.call.started_at,
      })),
    });
  }

  let pushed = 0;
  for (const [phone, t] of targets) {
    await pushLeadToCrm({
      caller: phone,
      agentName: t.agentName,
      agentPhone: t.agentPhone,
      status: t.call.status ?? undefined,
      direction: t.call.direction ?? "inbound",
      durationSeconds: t.call.talk_seconds ?? 0,
      startedAt: t.call.started_at,
      callId: t.call.id,
      providerCallId: t.call.provider_call_id,
      businessNumber: t.call.destination,
    });
    pushed++;
  }

  return NextResponse.json({
    dryRun: false,
    agentsMatched: wanted,
    callsScanned: scanned,
    leadsPushed: pushed,
    byAgent: countByAgent(targets),
  });
}

function countByAgent(targets: [string, { agentName: string }][]) {
  const counts: Record<string, number> = {};
  for (const [, t] of targets) counts[t.agentName] = (counts[t.agentName] ?? 0) + 1;
  return counts;
}
