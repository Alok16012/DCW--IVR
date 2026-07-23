"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { AVAILABILITY_META, AVAILABILITY_OPTIONS } from "@/lib/status";
import type { Agent, Team } from "@/lib/types";

export function AgentModal({
  open,
  onClose,
  agent,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  agent: Agent | null;
  teams: Team[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(() => ({
    name: agent?.name ?? "",
    email: agent?.email ?? "",
    employee_code: agent?.employee_code ?? "",
    phone: agent?.phone ?? "",
    team_id: agent?.team_id ?? "",
    priority: agent?.priority ?? 100,
    ring_timeout: agent?.ring_timeout ?? 20,
    availability: agent?.availability ?? "offline",
    shift_start: agent?.shift_start ?? "09:00",
    shift_end: agent?.shift_end ?? "18:00",
    fallback_owner: agent?.fallback_owner ?? false,
    active: agent?.active ?? true,
  }));

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agent?.id,
          ...form,
          team_id: form.team_id || null,
          priority: Number(form.priority),
          ring_timeout: Number(form.ring_timeout),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast(agent ? "Agent updated." : "Agent created.", "success");
      onClose();
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={agent ? "Edit agent" : "Add agent"}
      description="Agents ring on their registered mobile number. Historical data is preserved on deactivation."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={loading}>
            {agent ? "Save changes" : "Create agent"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" className="col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Riya Sharma" />
        </Field>
        <Field label="Registered mobile">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 90000 10001" />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="agent@company.com" />
        </Field>
        <Field label="Employee code">
          <Input value={form.employee_code} onChange={(e) => set("employee_code", e.target.value)} placeholder="EMP-01" />
        </Field>
        <Field label="Team">
          <Select value={form.team_id} onChange={(e) => set("team_id", e.target.value)}>
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" hint="Lower rings first">
          <Input type="number" min={1} value={form.priority} onChange={(e) => set("priority", Number(e.target.value))} />
        </Field>
        <Field label="Ring timeout (sec)" hint="Recommended 15–20">
          <Input type="number" min={5} value={form.ring_timeout} onChange={(e) => set("ring_timeout", Number(e.target.value))} />
        </Field>
        <Field label="Shift start">
          <Input type="time" value={form.shift_start} onChange={(e) => set("shift_start", e.target.value)} />
        </Field>
        <Field label="Shift end">
          <Input type="time" value={form.shift_end} onChange={(e) => set("shift_end", e.target.value)} />
        </Field>
        <Field label="Availability">
          <Select value={form.availability} onChange={(e) => set("availability", e.target.value as typeof form.availability)}>
            {AVAILABILITY_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {AVAILABILITY_META[a].label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2 flex flex-wrap gap-4 pt-1">
          <Toggle label="Fallback owner (receives missed-call callbacks)" checked={form.fallback_owner} onChange={(v) => set("fallback_owner", v)} />
          <Toggle label="Active" checked={form.active} onChange={(v) => set("active", v)} />
        </div>
      </div>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-[var(--accent)]" : "bg-[var(--surface-hover)]"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </span>
      {label}
    </button>
  );
}
