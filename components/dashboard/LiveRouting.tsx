"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneIncoming, ChevronRight, Radio } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { initials, cn, formatDuration } from "@/lib/utils";

type SeqItem = { agentId: string; name: string; sequence: number; status: string; ringSeconds: number | null };
type LiveState = {
  activeCall: { id: string; caller: string; startedAt: string; attemptsCount: number } | null;
  sequence: SeqItem[];
};

const STATUS_LABEL: Record<string, string> = {
  ringing: "Ringing…",
  answered: "Answered",
  no_answer: "No answer",
  busy: "Busy",
  rejected: "Rejected",
  failed: "Failed",
  queued: "Queued",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

function statusTone(status: string) {
  if (status === "answered") return "text-[var(--success)]";
  if (status === "ringing") return "text-[var(--accent)]";
  if (["no_answer", "busy", "rejected", "failed"].includes(status)) return "text-[var(--danger)]";
  return "text-[var(--text-faint)]";
}

export function LiveRouting({ ringTimeout }: { ringTimeout: number }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<LiveState>({ activeCall: null, sequence: [] });
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      /* ignore transient */
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!state.activeCall) {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const start = new Date(state.activeCall.startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.activeCall]);

  async function simulateInbound() {
    setBusy(true);
    try {
      const res = await fetch("/api/simulate/inbound", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.outcome === "missed_closed") toast("Call arrived outside office hours — callback created.", "info");
      else if (data.outcome === "missed_no_agents") toast("No eligible agents — call missed, callback created.", "info");
      else toast("Incoming call is now ringing agent 1.", "success");
      await load();
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    setBusy(true);
    try {
      const res = await fetch("/api/simulate/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No ringing call");
      const s = data.call?.status;
      if (data.outcome === "answered") toast("Agent answered — call connected. Routing stopped.", "success");
      else if (s === "missed") toast("All agents exhausted — call missed, one callback created.", "info");
      else toast(`Agent ${data.outcome.replace("_", " ")} — advancing to next agent.`, "info");
      await load();
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const active = state.activeCall;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <Radio className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Live call routing</h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Sequential routing · {ringTimeout}s ring timeout
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-[var(--success)]">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--success)]" /> Live
        </span>
      </div>

      <div className="p-5">
        {active ? (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
                  Live incoming call
                </p>
                <p className="text-2xl font-bold tracking-tight text-[var(--text)]">{active.caller}</p>
                <p className="text-xs text-[var(--text-muted)]">Customer · routing in progress</p>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--text)]">
                <span className="size-1.5 rounded-full bg-[var(--success)]" />
                {formatDuration(elapsed)}
              </span>
            </div>

            <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
              {state.sequence.map((item, idx) => {
                const isActive = item.status === "ringing";
                const answered = item.status === "answered";
                return (
                  <div key={item.agentId} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex min-w-[120px] flex-col items-center rounded-xl border p-3 text-center transition-colors",
                        isActive
                          ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                          : answered
                            ? "border-[var(--success)]/40 bg-[var(--success-soft)]"
                            : "border-[var(--border)] bg-[var(--bg-elevated)]",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-12 place-items-center rounded-full text-sm font-bold",
                          isActive
                            ? "bg-[var(--accent)] text-white ring-pulse"
                            : answered
                              ? "bg-[var(--success)] text-white"
                              : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                        )}
                      >
                        {initials(item.name)}
                      </span>
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                        Agent {String(item.sequence).padStart(2, "0")}
                      </p>
                      <p className="text-sm font-semibold text-[var(--text)]">{item.name}</p>
                      <p className={cn("text-xs", statusTone(item.status))}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </p>
                    </div>
                    {idx < state.sequence.length - 1 && (
                      <ChevronRight className="size-4 shrink-0 text-[var(--text-faint)]" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--text-faint)]">
              <PhoneIncoming className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">No live call right now</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Simulate an incoming customer call to watch sequential routing in action.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--text-muted)]">
            {active
              ? "Advance the ring to the next eligible agent, or let one answer."
              : "Mock provider drives the same engine Exotel will."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={simulateInbound} loading={busy} disabled={!!active}>
              <PhoneIncoming className="size-4" /> Simulate incoming call
            </Button>
            <Button size="sm" onClick={advance} loading={busy} disabled={!active}>
              Simulate next attempt
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
