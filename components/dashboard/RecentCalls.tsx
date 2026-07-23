import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { CallStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Waypoints, PhoneIncoming, PhoneOutgoing, ArrowUpRight } from "lucide-react";
import { maskPhone, relativeTime } from "@/lib/utils";
import type { Call } from "@/lib/types";
import type { CallStatus } from "@/lib/status";

export function RecentCalls({
  calls,
  agentNames,
  mask,
}: {
  calls: Call[];
  agentNames: Map<string, string>;
  mask: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Recent calls"
        subtitle="Latest call journeys"
        icon={<Waypoints className="size-[18px]" />}
        action={
          <Link
            href="/calls"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            View all <ArrowUpRight className="size-3.5" />
          </Link>
        }
      />
      {calls.length === 0 ? (
        <EmptyState icon={<Waypoints className="size-5" />} title="No calls in this period" />
      ) : (
        <Table>
          <THead>
            <TH>From</TH>
            <TH>Direction</TH>
            <TH>Agent</TH>
            <TH>Status</TH>
            <TH align="right">When</TH>
          </THead>
          <TBody>
            {calls.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/calls/${c.id}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)]">
                    {mask ? maskPhone(c.direction === "inbound" ? c.caller : c.destination) : c.direction === "inbound" ? c.caller : c.destination}
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
                <TD className="text-[var(--text-muted)]">
                  {c.connected_agent_id ? agentNames.get(c.connected_agent_id) ?? "—" : "—"}
                </TD>
                <TD>
                  <CallStatusBadge status={c.status as CallStatus} />
                </TD>
                <TD align="right" className="text-xs text-[var(--text-faint)]">
                  {relativeTime(c.started_at)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
