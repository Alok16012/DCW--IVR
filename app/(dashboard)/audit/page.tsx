import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollText } from "lucide-react";

const ACTION_TONE: Record<string, "accent" | "info" | "warning" | "success" | "danger" | "neutral"> = {
  routing: "accent",
  agent: "info",
  settings: "warning",
  export: "success",
  notify: "neutral",
};

function toneFor(action: string) {
  const prefix = action.split(".")[0];
  return ACTION_TONE[prefix] ?? "neutral";
}

export default async function AuditPage() {
  await requireRole(["super_admin", "manager", "auditor"]);
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (logs ?? []) as AuditLog[];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Governance"
        title="Audit logs"
        subtitle="Who changed routing, agents, settings, or ran exports — and when."
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-5" />} title="No audit entries yet" description="Configuration changes and exports are recorded here." />
        ) : (
          <Table>
            <THead>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Actor</TH>
              <TH align="right">When</TH>
            </THead>
            <TBody>
              {rows.map((log) => (
                <TR key={log.id}>
                  <TD>
                    <Badge tone={toneFor(log.action)}>{log.action}</Badge>
                  </TD>
                  <TD className="text-[var(--text-muted)]">
                    {log.entity}
                    {log.entity_id && (
                      <span className="ml-1 font-mono text-[11px] text-[var(--text-faint)]">
                        {log.entity_id.slice(0, 8)}
                      </span>
                    )}
                  </TD>
                  <TD className="text-[var(--text)]">{log.actor_name ?? "System"}</TD>
                  <TD align="right" className="text-xs text-[var(--text-faint)]" title={new Date(log.created_at).toLocaleString()}>
                    {relativeTime(log.created_at)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
