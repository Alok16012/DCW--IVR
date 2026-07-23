import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePeriod } from "@/lib/period";
import { getAgentReport } from "@/lib/queries/reports";
import { toCsv } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, name")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const range = resolvePeriod(sp.get("period") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const report = await getAgentReport(supabase, range);

  const csv = toCsv(
    report.rows.map((r) => ({
      agent: r.name,
      inbound_answered: r.inboundAnswered,
      inbound_offered: r.inboundOffered,
      inbound_missed_by_agent: r.inboundMissedByAgent,
      outbound_initiated: r.outboundInitiated,
      outbound_connected: r.outboundConnected,
      total_connected: r.totalConnected,
      talk_seconds: r.talkSeconds,
      agent_answer_rate_pct: r.agentAnswerRate,
      callbacks_assigned: r.callbacksAssigned,
      callbacks_resolved: r.callbacksResolved,
      callback_completion_pct: r.callbackCompletion,
    })),
    [
      "agent",
      "inbound_answered",
      "inbound_offered",
      "inbound_missed_by_agent",
      "outbound_initiated",
      "outbound_connected",
      "total_connected",
      "talk_seconds",
      "agent_answer_rate_pct",
      "callbacks_assigned",
      "callbacks_resolved",
      "callback_completion_pct",
    ],
  );

  await logAudit(createAdminClient(), {
    organizationId: profile.organization_id,
    actorId: profile.id,
    actorName: profile.name,
    action: "export.agent_report_csv",
    entity: "reports",
    newValues: { period: range.key, agents: report.rows.length },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agent-report-${range.key}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
