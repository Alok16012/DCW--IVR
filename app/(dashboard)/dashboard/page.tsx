import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod, type PeriodKey } from "@/lib/period";
import { getDashboardData } from "@/lib/queries/metrics";
import { formatDuration, humanDuration } from "@/lib/utils";
import type { Agent, Call, RoutingRule } from "@/lib/types";
import type { CallbackPriority } from "@/lib/status";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { LiveRouting } from "@/components/dashboard/LiveRouting";
import { HourlyVolumeChart, AnsweredMissedTrend, InboundOutboundSplit } from "@/components/dashboard/Charts";
import { AgentStatusPanel } from "@/components/dashboard/AgentStatusPanel";
import { RecentCalls } from "@/components/dashboard/RecentCalls";
import { CallbackMiniPanel } from "@/components/dashboard/CallbackMiniPanel";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { profile } = await requireSession();
  const sp = await searchParams;
  const range = resolvePeriod(sp.period, sp.from, sp.to);
  const supabase = await createClient();

  const data = await getDashboardData(supabase, range);

  const [{ data: agents }, { data: recentCalls }, { data: rule }, { data: pendingCbRaw }] = await Promise.all([
    supabase.from("agents").select("*").order("priority"),
    supabase.from("calls").select("*").order("started_at", { ascending: false }).limit(8),
    supabase.from("routing_rules").select("*").eq("active", true).order("created_at").limit(1).maybeSingle(),
    supabase
      .from("callbacks")
      .select("id, caller, priority, due_at")
      .in("status", ["open", "scheduled", "in_progress", "attempted"])
      .order("due_at")
      .limit(6),
  ]);

  const agentList = (agents ?? []) as Agent[];
  const agentNames = new Map(agentList.map((a) => [a.id, a.name]));
  const now = Date.now();
  const pendingCallbacks = (pendingCbRaw ?? []).map((cb) => ({
    id: cb.id as string,
    caller: cb.caller as string,
    priority: cb.priority as CallbackPriority,
    due_at: cb.due_at as string,
    overdue: new Date(cb.due_at as string).getTime() < now,
  }));

  const mask = profile.role === "auditor";
  const canCall = ["super_admin", "manager", "agent"].includes(profile.role);
  const ringTimeout = (rule as RoutingRule | null)?.ring_timeout ?? 20;

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting}, ${profile.name.split(" ")[0]}`}
        subtitle="Here's how your team and customer calls are doing."
        actions={<PeriodSelector current={range.key as PeriodKey} />}
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <KpiCard label="Total calls" value={data.kpis.totalCalls} sub="Unique call journeys" icon="Waypoints" tone="accent" emphasis />
        <KpiCard label="Inbound" value={data.kpis.inbound} sub="Received on business line" icon="PhoneIncoming" tone="info" />
        <KpiCard label="Outbound" value={data.kpis.outbound} sub="Initiated via platform" icon="PhoneOutgoing" tone="accent" />
        <KpiCard label="Answered" value={data.kpis.answered} sub="Connected to an agent" icon="PhoneCall" tone="success" />
        <KpiCard label="Missed" value={data.kpis.missed} sub="No agent connected" icon="PhoneMissed" tone="danger" />
        <KpiCard label="Answer rate" value={`${data.kpis.answerRate}%`} sub="Answered ÷ inbound" icon="Target" tone="success" />
        <KpiCard label="Total talk time" value={formatDuration(data.kpis.totalTalkSeconds)} sub={`Avg ${humanDuration(data.kpis.avgTalkSeconds)}`} icon="Clock" tone="info" />
        <KpiCard label="Avg attempts" value={data.kpis.avgAttempts} sub="Per inbound journey" icon="Repeat" tone="warning" />
      </div>

      {/* live routing + side KPIs */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <LiveRouting ringTimeout={ringTimeout} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <KpiCard label="Pending callbacks" value={data.kpis.pendingCallbacks} sub={`${data.kpis.overdueCallbacks} overdue`} icon="RotateCcw" tone="warning" />
          <KpiCard label="Overdue callbacks" value={data.kpis.overdueCallbacks} sub="Past due date/time" icon="AlarmClock" tone="danger" />
          <KpiCard label="Available agents" value={agentList.filter((a) => a.availability === "available").length} sub={`of ${agentList.length} total`} icon="UserCheck" tone="success" />
        </div>
      </div>

      {/* charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Hourly call volume" subtitle="Inbound vs outbound by hour" icon={<BarChart3 className="size-[18px]" />} />
          <div className="p-5 pt-2">
            <HourlyVolumeChart data={data.hourly} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Inbound vs outbound" subtitle="Direction split" icon={<PieChart className="size-[18px]" />} />
          <div className="grid place-items-center p-5 pt-2">
            <InboundOutboundSplit data={data.split} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Answered vs missed" subtitle="Daily trend across the period" icon={<TrendingUp className="size-[18px]" />} />
          <div className="p-5 pt-2">
            <AnsweredMissedTrend data={data.trend} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Top agents" subtitle="By connected calls" icon={<BarChart3 className="size-[18px]" />} />
          <div className="p-3">
            {data.topAgents.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">No connected calls yet.</p>
            ) : (
              <ul className="space-y-1">
                {data.topAgents.map((a, i) => (
                  <li key={a.agentId} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-[var(--surface-hover)]/60">
                    <span className="grid size-6 place-items-center rounded-md bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-muted)]">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium text-[var(--text)]">{a.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">{formatDuration(a.talkSeconds)}</span>
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                      {a.connected}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* tables */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentCalls calls={(recentCalls ?? []) as Call[]} agentNames={agentNames} mask={mask} />
        </div>
        <div className="space-y-6">
          <CallbackMiniPanel callbacks={pendingCallbacks} mask={mask} canCall={canCall} />
          <AgentStatusPanel agents={agentList} />
        </div>
      </div>
    </div>
  );
}
