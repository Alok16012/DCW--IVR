import { Card, CardHeader } from "@/components/ui/Card";
import { AvailabilityBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";
import { initials } from "@/lib/utils";
import type { Agent } from "@/lib/types";
import type { Availability } from "@/lib/status";

export function AgentStatusPanel({ agents }: { agents: Agent[] }) {
  return (
    <Card>
      <CardHeader
        title="Agent live status"
        subtitle={`${agents.filter((a) => a.availability === "available").length} available now`}
        icon={<Users className="size-[18px]" />}
      />
      <div className="p-3">
        {agents.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No agents yet" />
        ) : (
          <ul className="space-y-1">
            {agents.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-[var(--surface-hover)]/60"
              >
                <span className="grid size-9 place-items-center rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--text-muted)]">
                  {initials(a.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{a.name}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">Priority {a.priority}</p>
                </div>
                <AvailabilityBadge status={a.availability as Availability} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
