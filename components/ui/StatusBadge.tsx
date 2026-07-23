import { Badge } from "./Badge";
import {
  ATTEMPT_STATUS_META,
  AVAILABILITY_META,
  CALLBACK_STATUS_META,
  CALL_STATUS_META,
  DISPOSITION_META,
  PRIORITY_META,
  type AttemptStatus,
  type Availability,
  type CallStatus,
  type CallbackPriority,
  type CallbackStatus,
  type Disposition,
} from "@/lib/status";

export function CallStatusBadge({ status }: { status: CallStatus }) {
  const meta = CALL_STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

export function AttemptStatusBadge({ status }: { status: AttemptStatus }) {
  const meta = ATTEMPT_STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function CallbackStatusBadge({ status }: { status: CallbackStatus }) {
  const meta = CALLBACK_STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function AvailabilityBadge({ status }: { status: Availability }) {
  const meta = AVAILABILITY_META[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: CallbackPriority }) {
  const meta = PRIORITY_META[priority] ?? { label: priority, tone: "neutral" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function DispositionBadge({ disposition }: { disposition: Disposition | null }) {
  if (!disposition) return <span className="text-[var(--text-faint)]">—</span>;
  const meta = DISPOSITION_META[disposition] ?? { label: disposition, tone: "neutral" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
