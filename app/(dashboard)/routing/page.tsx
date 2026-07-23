import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Agent, RoutingRule, RoutingRuleAgent, BusinessHour } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RoutingBuilder, type RoutingAgentRow } from "@/components/routing/RoutingBuilder";
import { CalendarClock, ArrowUpRight } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function RoutingPage() {
  const { profile } = await requireRole(["super_admin", "manager"]);
  const supabase = await createClient();

  const { data: rule } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!rule) {
    return (
      <div>
        <PageHeader eyebrow="Configuration" title="Routing" />
        <Card>
          <EmptyState title="No routing rule found" description="Run the seed to create the primary routing rule." />
        </Card>
      </div>
    );
  }

  const [{ data: ruleAgents }, { data: agents }, { data: hours }] = await Promise.all([
    supabase.from("routing_rule_agents").select("*").eq("rule_id", rule.id).order("sequence"),
    supabase.from("agents").select("*"),
    supabase.from("business_hours").select("*").order("day_of_week"),
  ]);

  const agentById = new Map(((agents ?? []) as Agent[]).map((a) => [a.id, a]));
  const rows: RoutingAgentRow[] = ((ruleAgents ?? []) as RoutingRuleAgent[])
    .map((ra) => {
      const agent = agentById.get(ra.agent_id);
      if (!agent) return null;
      return {
        agentId: agent.id,
        name: agent.name,
        availability: agent.availability,
        priority: agent.priority,
        ringTimeout: ra.timeout_override ?? agent.ring_timeout,
        enabled: ra.enabled,
        active: agent.active,
      };
    })
    .filter(Boolean) as RoutingAgentRow[];

  const readOnly = profile.role !== "super_admin" && profile.role !== "manager";
  const businessHours = (hours ?? []) as BusinessHour[];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Routing"
        subtitle="Configure the sequential ring order, timeouts, eligibility and fallback — no code changes needed."
      />

      <RoutingBuilder rule={rule as RoutingRule} initialRows={rows} readOnly={readOnly} />

      <Card>
        <CardHeader
          title="Office hours"
          subtitle="Calls outside these hours create a callback (or route to the after-hours number)."
          icon={<CalendarClock className="size-[18px]" />}
          action={
            <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">
              Edit in settings <ArrowUpRight className="size-3.5" />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-4 lg:grid-cols-7">
          {DAYS.map((day, idx) => {
            const h = businessHours.find((x) => x.day_of_week === idx);
            const open = h?.enabled;
            return (
              <div
                key={day}
                className={`rounded-xl border p-3 text-center ${open ? "border-[var(--border)] bg-[var(--bg-elevated)]" : "border-[var(--border)] bg-[var(--surface)] opacity-60"}`}
              >
                <p className="text-xs font-semibold text-[var(--text)]">{day}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  {open ? `${h?.open_time?.slice(0, 5)}–${h?.close_time?.slice(0, 5)}` : "Closed"}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
