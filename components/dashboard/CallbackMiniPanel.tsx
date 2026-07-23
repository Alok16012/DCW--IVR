"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, RotateCcw, ArrowUpRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PriorityBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { OutboundCallModal } from "@/components/OutboundCallModal";
import { maskPhone, relativeTime } from "@/lib/utils";
import type { CallbackPriority } from "@/lib/status";

type MiniCallback = {
  id: string;
  caller: string;
  priority: CallbackPriority;
  due_at: string;
  overdue: boolean;
};

export function CallbackMiniPanel({
  callbacks,
  mask,
  canCall,
}: {
  callbacks: MiniCallback[];
  mask: boolean;
  canCall: boolean;
}) {
  const [call, setCall] = useState<{ number: string; id: string } | null>(null);

  return (
    <Card>
      <CardHeader
        title="Callback queue"
        subtitle={`${callbacks.length} pending`}
        icon={<RotateCcw className="size-[18px]" />}
        action={
          <Link
            href="/callbacks"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            View all <ArrowUpRight className="size-3.5" />
          </Link>
        }
      />
      <div className="p-3">
        {callbacks.length === 0 ? (
          <EmptyState icon={<RotateCcw className="size-5" />} title="No pending callbacks" description="Missed calls will appear here automatically." />
        ) : (
          <ul className="space-y-1">
            {callbacks.map((cb) => (
              <li key={cb.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-[var(--surface-hover)]/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">
                    {mask ? maskPhone(cb.caller) : cb.caller}
                  </p>
                  <p className="text-[11px] text-[var(--text-faint)]">
                    {cb.overdue ? (
                      <span className="text-[var(--danger)]">Overdue · {relativeTime(cb.due_at)}</span>
                    ) : (
                      <>Due {relativeTime(cb.due_at)}</>
                    )}
                  </p>
                </div>
                <PriorityBadge priority={cb.priority} />
                {canCall && (
                  <Button size="sm" variant="subtle" onClick={() => setCall({ number: cb.caller, id: cb.id })}>
                    <Phone className="size-3.5" /> Call
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <OutboundCallModal
        open={!!call}
        onClose={() => setCall(null)}
        presetNumber={call?.number}
        callbackId={call?.id}
      />
    </Card>
  );
}
