import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/telephony";
import type { BusinessHour, BusinessNumber, Holiday, Organization } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { Phone, Cpu, CalendarOff } from "lucide-react";

export default async function SettingsPage() {
  await requireRole(["super_admin"]);
  const supabase = await createClient();

  const [{ data: org }, { data: hours }, { data: numbers }, { data: holidays }] = await Promise.all([
    supabase.from("organizations").select("*").limit(1).maybeSingle(),
    supabase.from("business_hours").select("*").order("day_of_week"),
    supabase.from("business_numbers").select("*").order("created_at"),
    supabase.from("holidays").select("*").order("holiday_date"),
  ]);

  const provider = getProvider();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        subtitle="Company profile, business numbers, telephony provider, office hours and holidays."
      />

      {/* provider + numbers */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Telephony provider" subtitle="Provider-specific code is isolated behind an adapter." icon={<Cpu className="size-[18px]" />} />
          <div className="p-5">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div>
                <p className="text-sm font-semibold capitalize text-[var(--text)]">{provider.name} provider</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {provider.live
                    ? "Connected — placing real PSTN calls."
                    : "Simulation mode — drives the full routing engine without live calls."}
                </p>
              </div>
              <Badge tone={provider.live ? "success" : "warning"} dot>
                {provider.live ? "Live" : "Mock"}
              </Badge>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
              To go live, add Exotel credentials (SID, API key/token, caller ID) to the server
              environment and set <code className="rounded bg-[var(--surface-2)] px-1">TELEPHONY_PROVIDER=exotel</code>.
              Routing, reporting and callbacks are unchanged — only the call transport switches.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Business numbers" subtitle="Virtual numbers customers dial." icon={<Phone className="size-[18px]" />} />
          <div className="space-y-2 p-5">
            {((numbers ?? []) as BusinessNumber[]).map((n) => (
              <div key={n.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{n.number}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{n.label ?? "—"}</p>
                </div>
                <Badge tone={n.status === "active" ? "success" : "neutral"}>{n.status}</Badge>
              </div>
            ))}
            {(numbers ?? []).length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">No business numbers configured.</p>
            )}
          </div>
        </Card>
      </div>

      <SettingsForm
        organization={(org ?? { id: "", name: "", timezone: "Asia/Kolkata", settings: {}, status: "active", created_at: "" }) as Organization}
        hours={(hours ?? []) as BusinessHour[]}
      />

      {/* holidays */}
      <Card>
        <CardHeader title="Holidays" subtitle="Holiday-specific fallback applies on these dates." icon={<CalendarOff className="size-[18px]" />} />
        <div className="space-y-2 p-5">
          {((holidays ?? []) as Holiday[]).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No holidays configured.</p>
          ) : (
            ((holidays ?? []) as Holiday[]).map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{h.label ?? "Holiday"}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{new Date(h.holiday_date).toDateString()}</p>
                </div>
                <Badge tone="info">{h.fallback_rule ?? "callback"}</Badge>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
