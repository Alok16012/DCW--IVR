import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCalls } from "@/lib/queries/calls";
import { toCsv } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

// CSV export of the filtered call list (PRD §9.3, AC-08). Figures reconcile
// with the dashboard because the same filter definitions are applied.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, name, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const { calls } = await listCalls(supabase, {
    search: sp.get("search") ?? undefined,
    direction: sp.get("direction") ?? undefined,
    status: sp.get("status") ?? undefined,
    agentId: sp.get("agentId") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    pageSize: 5000,
  });

  const { data: agents } = await supabase.from("agents").select("id, name");
  const agentName = new Map((agents ?? []).map((a) => [a.id, a.name]));

  const rows = calls.map((c) => ({
    call_id: c.id,
    direction: c.direction,
    caller: c.caller,
    destination: c.destination ?? "",
    status: c.status,
    connected_agent: c.connected_agent_id ? agentName.get(c.connected_agent_id) ?? "" : "",
    initiated_by: c.initiated_by_agent_id ? agentName.get(c.initiated_by_agent_id) ?? "" : "",
    attempts: c.attempts_count,
    talk_seconds: c.talk_seconds,
    started_at: c.started_at,
    ended_at: c.ended_at ?? "",
  }));

  const csv = toCsv(rows, [
    "call_id",
    "direction",
    "caller",
    "destination",
    "status",
    "connected_agent",
    "initiated_by",
    "attempts",
    "talk_seconds",
    "started_at",
    "ended_at",
  ]);

  // audit the export (PRD §18: record exports)
  await logAudit(createAdminClient(), {
    organizationId: profile.organization_id,
    actorId: profile.id,
    actorName: profile.name,
    action: "export.calls_csv",
    entity: "calls",
    newValues: { count: rows.length, filters: Object.fromEntries(sp.entries()) },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="calls-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
