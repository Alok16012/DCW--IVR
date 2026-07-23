"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Check, UserCog, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge, CallbackStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import { OutboundCallModal } from "@/components/OutboundCallModal";
import { useToast } from "@/components/ui/Toast";
import { maskPhone, relativeTime, cn } from "@/lib/utils";
import type { CallbackPriority, CallbackStatus } from "@/lib/status";

export type CallbackRow = {
  id: string;
  caller: string;
  priority: CallbackPriority;
  status: CallbackStatus;
  due_at: string;
  attempts: number;
  owner_agent_id: string | null;
  owner_name: string | null;
  overdue: boolean;
};

type Tab = "pending" | "overdue" | "resolved" | "all";

export function CallbacksBoard({
  callbacks,
  agents,
  canManage,
  canCall,
  mask,
}: {
  callbacks: CallbackRow[];
  agents: { id: string; name: string }[];
  canManage: boolean;
  canCall: boolean;
  mask: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const [call, setCall] = useState<{ number: string; id: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const pendingStatuses: CallbackStatus[] = ["open", "scheduled", "in_progress", "attempted"];
    return {
      pending: callbacks.filter((c) => pendingStatuses.includes(c.status)).length,
      overdue: callbacks.filter((c) => c.overdue && pendingStatuses.includes(c.status)).length,
      resolved: callbacks.filter((c) => c.status === "resolved").length,
      all: callbacks.length,
    };
  }, [callbacks]);

  const filtered = useMemo(() => {
    const pendingStatuses: CallbackStatus[] = ["open", "scheduled", "in_progress", "attempted"];
    switch (tab) {
      case "pending":
        return callbacks.filter((c) => pendingStatuses.includes(c.status));
      case "overdue":
        return callbacks.filter((c) => c.overdue && pendingStatuses.includes(c.status));
      case "resolved":
        return callbacks.filter((c) => c.status === "resolved");
      default:
        return callbacks;
    }
  }, [callbacks, tab]);

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/callbacks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast(msg, "success");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "overdue", label: "Overdue", count: counts.overdue },
    { key: "resolved", label: "Resolved", count: counts.resolved },
    { key: "all", label: "All", count: counts.all },
  ];

  return (
    <>
      <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 text-[10px]", tab === t.key ? "bg-[var(--accent)]/20" : "bg-[var(--surface-2)]")}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Phone className="size-5" />}
            title="Nothing here"
            description="Missed inbound calls automatically create callbacks."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cb) => (
            <Card key={cb.id} className={cn("p-4", cb.overdue && cb.status !== "resolved" && "ring-1 ring-inset ring-[var(--danger)]/25")}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {mask ? maskPhone(cb.caller) : cb.caller}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-faint)]">
                    {cb.overdue && cb.status !== "resolved" ? (
                      <>
                        <AlertTriangle className="size-3 text-[var(--danger)]" />
                        <span className="text-[var(--danger)]">Overdue · {relativeTime(cb.due_at)}</span>
                      </>
                    ) : (
                      <>
                        <Clock className="size-3" /> Due {relativeTime(cb.due_at)}
                      </>
                    )}
                  </p>
                </div>
                <PriorityBadge priority={cb.priority} />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <CallbackStatusBadge status={cb.status} />
                {cb.attempts > 0 && <Badge tone="neutral">{cb.attempts} attempts</Badge>}
              </div>

              <div className="mt-3 border-t border-[var(--border)] pt-3">
                {canManage ? (
                  <Select
                    value={cb.owner_agent_id ?? ""}
                    onChange={(e) => patch(cb.id, { owner_agent_id: e.target.value || null }, "Callback reassigned.")}
                    className="mb-2 h-9 text-xs"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <UserCog className="size-3.5 text-[var(--text-faint)]" />
                    {cb.owner_name ?? "Unassigned"}
                  </p>
                )}

                <div className="flex gap-2">
                  {canCall && cb.status !== "resolved" && (
                    <Button size="sm" variant="subtle" className="flex-1" onClick={() => setCall({ number: cb.caller, id: cb.id })}>
                      <Phone className="size-3.5" /> Call
                    </Button>
                  )}
                  {cb.status !== "resolved" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === cb.id}
                      onClick={() => patch(cb.id, { status: "resolved", outcome: "resolved" }, "Callback resolved.")}
                    >
                      <Check className="size-3.5" /> Resolve
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <OutboundCallModal open={!!call} onClose={() => setCall(null)} presetNumber={call?.number} callbackId={call?.id} />
    </>
  );
}
