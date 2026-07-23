"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Phone, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AvailabilityBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentModal } from "./AgentModal";
import { useToast } from "@/components/ui/Toast";
import { initials, maskPhone, cn } from "@/lib/utils";
import { AVAILABILITY_META, AVAILABILITY_OPTIONS, type Availability } from "@/lib/status";
import type { Agent, Team } from "@/lib/types";

export function AgentsManager({
  agents,
  teams,
  canEdit,
  mask,
}: {
  agents: (Agent & { team_name?: string | null })[];
  teams: Team[];
  canEdit: boolean;
  mask: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(a: Agent) {
    setEditing(a);
    setModalOpen(true);
  }

  async function setAvailability(agentId: string, availability: Availability) {
    setBusyId(agentId);
    try {
      const res = await fetch("/api/agents/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, availability }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          {agents.filter((a) => a.active).length} active · {agents.length} total
        </p>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add agent
          </Button>
        )}
      </div>

      {agents.length === 0 ? (
        <Card>
          <EmptyState title="No agents yet" description="Add your first agent to start routing calls." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <Card key={a.id} className={cn("p-4", !a.active && "opacity-60")}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-hover)] text-sm font-bold text-[var(--text)]">
                    {initials(a.name)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">{a.name}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      {a.employee_code ?? "—"} · {a.team_name ?? "No team"}
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => openEdit(a)}
                    className="grid size-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    aria-label="Edit agent"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
                <p className="flex items-center gap-2">
                  <Phone className="size-3.5 text-[var(--text-faint)]" />
                  {mask ? maskPhone(a.phone) : a.phone}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="size-3.5 text-[var(--text-faint)]" />
                  Priority {a.priority} · {a.ring_timeout}s ring
                  {a.shift_start && a.shift_end && ` · ${a.shift_start}–${a.shift_end}`}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                {canEdit ? (
                  <select
                    value={a.availability}
                    disabled={busyId === a.id}
                    onChange={(e) => setAvailability(a.id, e.target.value as Availability)}
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)]"
                  >
                    {AVAILABILITY_OPTIONS.map((av) => (
                      <option key={av} value={av}>
                        {AVAILABILITY_META[av].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <AvailabilityBadge status={a.availability as Availability} />
                )}
                <div className="flex items-center gap-1.5">
                  {a.fallback_owner && <Badge tone="info">Fallback</Badge>}
                  {!a.active && <Badge tone="neutral">Inactive</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {canEdit && (
        <AgentModal open={modalOpen} onClose={() => setModalOpen(false)} agent={editing} teams={teams} />
      )}
    </>
  );
}
