import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCalls } from "@/lib/queries/calls";
import { maskPhone, formatDuration, relativeTime } from "@/lib/utils";
import type { Agent } from "@/lib/types";
import type { CallStatus } from "@/lib/status";

import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { CallStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { CallFilters } from "@/components/calls/CallFilters";
import { PhoneIncoming, PhoneOutgoing, Waypoints } from "lucide-react";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { profile } = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();

  const page = sp.page ? parseInt(sp.page, 10) : 1;
  const { calls, total, pageSize } = await listCalls(supabase, {
    search: sp.search,
    direction: sp.direction,
    status: sp.status,
    agentId: sp.agentId,
    from: sp.from,
    to: sp.to,
    page,
  });

  const { data: agents } = await supabase.from("agents").select("*").order("name");
  const agentList = (agents ?? []) as Agent[];
  const agentNames = new Map(agentList.map((a) => [a.id, a.name]));
  const mask = profile.role === "auditor";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Call operations"
        title="All calls"
        subtitle="Unified inbound and outbound call log with full attempt journeys."
      />

      <CallFilters agents={agentList.map((a) => ({ id: a.id, name: a.name }))} />

      <Card className="overflow-hidden">
        {calls.length === 0 ? (
          <EmptyState
            icon={<Waypoints className="size-5" />}
            title="No calls match your filters"
            description="Try clearing filters or simulate a call from the dashboard."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>From → To</TH>
                <TH>Direction</TH>
                <TH>Status</TH>
                <TH>Agent</TH>
                <TH align="center">Attempts</TH>
                <TH align="right">Talk time</TH>
                <TH align="right">When</TH>
              </THead>
              <TBody>
                {calls.map((c) => (
                  <TR key={c.id} onClick={undefined}>
                    <TD>
                      <Link href={`/calls/${c.id}`} className="group block">
                        <span className="font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
                          {mask ? maskPhone(c.caller) : c.caller}
                        </span>
                        {c.destination && (
                          <span className="block text-[11px] text-[var(--text-faint)]">
                            → {mask ? maskPhone(c.destination) : c.destination}
                          </span>
                        )}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={c.direction === "inbound" ? "info" : "accent"}>
                        {c.direction === "inbound" ? (
                          <PhoneIncoming className="size-3" />
                        ) : (
                          <PhoneOutgoing className="size-3" />
                        )}
                        {c.direction}
                      </Badge>
                    </TD>
                    <TD>
                      <CallStatusBadge status={c.status as CallStatus} />
                    </TD>
                    <TD className="text-[var(--text-muted)]">
                      {c.connected_agent_id
                        ? agentNames.get(c.connected_agent_id) ?? "—"
                        : c.initiated_by_agent_id
                          ? agentNames.get(c.initiated_by_agent_id) ?? "—"
                          : "—"}
                    </TD>
                    <TD align="center" className="text-[var(--text-muted)]">{c.attempts_count}</TD>
                    <TD align="right" className="tabular-nums text-[var(--text-muted)]">
                      {c.talk_seconds ? formatDuration(c.talk_seconds) : "—"}
                    </TD>
                    <TD align="right" className="text-xs text-[var(--text-faint)]">
                      {relativeTime(c.started_at)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-[var(--border)]">
              <Pagination page={page} pageSize={pageSize} total={total} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
