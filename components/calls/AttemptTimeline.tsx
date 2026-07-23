import { AttemptStatusBadge } from "@/components/ui/StatusBadge";
import { initials, formatDuration } from "@/lib/utils";
import type { AttemptStatus } from "@/lib/status";

type Attempt = {
  id: string;
  sequence: number;
  agent_name: string | null;
  status: string;
  ring_seconds: number | null;
  started_at: string;
};

export function AttemptTimeline({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">No attempts recorded.</p>;
  }
  return (
    <ol className="relative space-y-1 px-5 py-4">
      {attempts.map((a, idx) => {
        const answered = a.status === "answered";
        return (
          <li key={a.id} className="relative flex gap-4 pb-4 last:pb-0">
            {/* connector */}
            {idx < attempts.length - 1 && (
              <span className="absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-px bg-[var(--border)]" />
            )}
            <span
              className={`z-10 grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ${
                answered
                  ? "bg-[var(--success)] text-white"
                  : ["no_answer", "busy", "rejected", "failed"].includes(a.status)
                    ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)]"
              }`}
            >
              {a.agent_name ? initials(a.agent_name) : a.sequence}
            </span>
            <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  Attempt {a.sequence} · {a.agent_name ?? "Unknown agent"}
                </p>
                <p className="text-[11px] text-[var(--text-faint)]">
                  {new Date(a.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {a.ring_seconds != null && ` · rang ${formatDuration(a.ring_seconds)}`}
                </p>
              </div>
              <AttemptStatusBadge status={a.status as AttemptStatus} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
