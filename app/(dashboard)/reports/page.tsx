import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod, type PeriodKey } from "@/lib/period";
import { getAgentReport } from "@/lib/queries/reports";
import { formatDuration } from "@/lib/utils";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { Download, Info, Users, GitBranch, PhoneCall, PhoneMissed } from "lucide-react";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireRole(["super_admin", "manager", "auditor"]);
  const sp = await searchParams;
  const range = resolvePeriod(sp.period, sp.from, sp.to);
  const supabase = await createClient();
  const report = await getAgentReport(supabase, range);

  const exportHref = `/api/reports/export?period=${range.key}${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`;
  const rec = report.reconciliation;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analytics"
        title="Agent performance report"
        subtitle="Agent-wise offered, answered, outbound, connected, talk time and callback completion."
        actions={
          <>
            <PeriodSelector current={range.key as PeriodKey} />
            <a href={exportHref}>
              <Button variant="secondary">
                <Download className="size-4" /> Export CSV
              </Button>
            </a>
          </>
        }
      />

      {/* reconciliation: journeys vs attempts, the PRD's key distinction */}
      <Card className="border-[var(--accent)]/20">
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <Info className="size-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--text)]">Call journeys vs agent attempts</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              One inbound call may ring several agents. The company counts it as one journey; the
              attempt report shows each agent leg. Both are required and never mixed.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Recon icon={<GitBranch className="size-4" />} label="Inbound journeys" value={rec.uniqueInboundJourneys} tone="accent" />
              <Recon icon={<Users className="size-4" />} label="Agent attempts" value={rec.totalInboundAttempts} tone="info" />
              <Recon icon={<PhoneCall className="size-4" />} label="Company answered" value={rec.companyAnswered} tone="success" />
              <Recon icon={<PhoneMissed className="size-4" />} label="Company missed" value={rec.companyMissed} tone="danger" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Per-agent metrics" subtitle={`${report.rows.length} agents · ${range.key}`} />
        {report.rows.length === 0 ? (
          <EmptyState title="No agents to report" />
        ) : (
          <Table>
            <THead>
              <TH>Agent</TH>
              <TH align="center">Inbound answered</TH>
              <TH align="center">Inbound offered</TH>
              <TH align="center">Missed (agent)</TH>
              <TH align="center">Out. initiated</TH>
              <TH align="center">Out. connected</TH>
              <TH align="center">Total connected</TH>
              <TH align="right">Talk time</TH>
              <TH align="right">Answer rate</TH>
              <TH align="right">Callback %</TH>
            </THead>
            <TBody>
              {report.rows.map((r) => (
                <TR key={r.agentId}>
                  <TD className="font-medium text-[var(--text)]">{r.name}</TD>
                  <TD align="center">{r.inboundAnswered}</TD>
                  <TD align="center" className="text-[var(--text-muted)]">{r.inboundOffered}</TD>
                  <TD align="center" className="text-[var(--text-muted)]">{r.inboundMissedByAgent}</TD>
                  <TD align="center" className="text-[var(--text-muted)]">{r.outboundInitiated}</TD>
                  <TD align="center" className="text-[var(--text-muted)]">{r.outboundConnected}</TD>
                  <TD align="center" className="font-semibold text-[var(--text)]">{r.totalConnected}</TD>
                  <TD align="right" className="tabular-nums text-[var(--text-muted)]">{formatDuration(r.talkSeconds)}</TD>
                  <TD align="right">
                    <span className={r.agentAnswerRate >= 70 ? "text-[var(--success)]" : r.agentAnswerRate >= 40 ? "text-[var(--warning)]" : "text-[var(--danger)]"}>
                      {r.agentAnswerRate}%
                    </span>
                  </TD>
                  <TD align="right" className="text-[var(--text-muted)]">{r.callbackCompletion}%</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Recon({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  const toneColor = {
    accent: "text-[var(--accent)] bg-[var(--accent-soft)]",
    info: "text-[var(--info)] bg-[var(--info-soft)]",
    success: "text-[var(--success)] bg-[var(--success-soft)]",
    danger: "text-[var(--danger)] bg-[var(--danger-soft)]",
  }[tone];
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <span className={`grid size-7 place-items-center rounded-lg ${toneColor}`}>{icon}</span>
      <p className="mt-2 text-xl font-bold text-[var(--text)]">{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
