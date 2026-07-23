import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCallDetail } from "@/lib/queries/calls";
import { maskPhone, formatDuration } from "@/lib/utils";
import type { CallStatus } from "@/lib/status";

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CallStatusBadge, DispositionBadge } from "@/components/ui/StatusBadge";
import { AttemptTimeline } from "@/components/calls/AttemptTimeline";
import { NotesEditor } from "@/components/calls/NotesEditor";
import {
  ArrowLeft,
  PhoneIncoming,
  PhoneOutgoing,
  ListOrdered,
  StickyNote,
  Mic,
  RotateCcw,
  Lock,
} from "lucide-react";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireSession();
  const supabase = await createClient();
  const detail = await getCallDetail(supabase, id);
  if (!detail) notFound();

  const { call } = detail;
  const mask = profile.role === "auditor";
  const canNote = ["super_admin", "manager", "agent"].includes(profile.role);
  const displayFrom = mask ? maskPhone(call.caller) : call.caller;
  const displayTo = call.destination ? (mask ? maskPhone(call.destination) : call.destination) : null;

  return (
    <div className="space-y-5">
      <Link
        href="/calls"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-3.5" /> Back to all calls
      </Link>

      {/* summary */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              className={`grid size-12 place-items-center rounded-2xl ${
                call.direction === "inbound"
                  ? "bg-[var(--info-soft)] text-[var(--info)]"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]"
              }`}
            >
              {call.direction === "inbound" ? (
                <PhoneIncoming className="size-6" />
              ) : (
                <PhoneOutgoing className="size-6" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[var(--text)]">{displayFrom}</h1>
                {displayTo && <span className="text-sm text-[var(--text-faint)]">→ {displayTo}</span>}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge tone={call.direction === "inbound" ? "info" : "accent"}>{call.direction}</Badge>
                <CallStatusBadge status={call.status as CallStatus} />
                <span className="text-xs text-[var(--text-faint)]">
                  {new Date(call.started_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Attempts" value={String(call.attempts_count)} />
          <Metric label="Talk time" value={call.talk_seconds ? formatDuration(call.talk_seconds) : "—"} />
          <Metric label={call.direction === "inbound" ? "Connected agent" : "Initiated by"} value={call.direction === "inbound" ? detail.connectedAgentName ?? "—" : detail.initiatedByName ?? "—"} />
          <Metric label="Journey ID" value={call.id.slice(0, 8)} mono />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* timeline */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Attempt timeline"
              subtitle="Every agent leg in order, with timing and status"
              icon={<ListOrdered className="size-[18px]" />}
            />
            <AttemptTimeline attempts={detail.attempts} />
          </Card>

          <Card>
            <CardHeader title="Notes & dispositions" subtitle="Call facts are immutable — notes are additive" icon={<StickyNote className="size-[18px]" />} />
            <div className="divide-y divide-[var(--border)]">
              {detail.notes.length === 0 ? (
                <p className="px-5 py-6 text-sm text-[var(--text-muted)]">No notes yet.</p>
              ) : (
                detail.notes.map((n) => (
                  <div key={n.id} className="px-5 py-4">
                    <div className="mb-1.5 flex items-center gap-2">
                      {n.disposition && <DispositionBadge disposition={n.disposition as never} />}
                      <span className="text-[11px] text-[var(--text-faint)]">
                        {n.author ?? "System"} · {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    {n.note && <p className="text-sm text-[var(--text)]">{n.note}</p>}
                    {n.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {n.tags.map((t) => (
                          <span key={t} className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* side: recording, callback, add note */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Recording" icon={<Mic className="size-[18px]" />} />
            <div className="p-5">
              {detail.recording?.provider_ref ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <Lock className="size-3.5 text-[var(--text-faint)]" />
                    Secure provider recording
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                    Ref {detail.recording.provider_ref} · {formatDuration(detail.recording.duration)}
                  </p>
                  <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    Provider URLs are never exposed publicly. Playback uses time-limited
                    authenticated access when the account is live.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No recording available for this call.</p>
              )}
            </div>
          </Card>

          {detail.callback && (
            <Card>
              <CardHeader title="Linked callback" icon={<RotateCcw className="size-[18px]" />} />
              <div className="p-5">
                <Link
                  href="/callbacks"
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 hover:border-[var(--accent)]/40"
                >
                  <span className="text-sm text-[var(--text)]">Callback task</span>
                  <Badge tone="warning">{detail.callback.status}</Badge>
                </Link>
              </div>
            </Card>
          )}

          {canNote && (
            <Card>
              <CardHeader title="Add note" icon={<StickyNote className="size-[18px]" />} />
              <NotesEditor callId={call.id} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold text-[var(--text)] ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
