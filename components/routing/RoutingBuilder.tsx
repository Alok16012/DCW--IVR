"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, PhoneMissed } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field, Textarea } from "@/components/ui/Input";
import { AvailabilityBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { initials, cn } from "@/lib/utils";
import type { Availability } from "@/lib/status";
import type { RoutingRule } from "@/lib/types";

export type RoutingAgentRow = {
  agentId: string;
  name: string;
  availability: string;
  priority: number;
  ringTimeout: number;
  enabled: boolean;
  active: boolean;
};

function SortableRow({ row, onToggle }: { row: RoutingAgentRow; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.agentId });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-[var(--bg-elevated)] p-3",
        isDragging ? "border-[var(--accent)]/50 shadow-lg" : "border-[var(--border)]",
        !row.enabled && "opacity-55",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-[var(--text-faint)] hover:text-[var(--text)] active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-5" />
      </button>
      <span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-2)] text-xs font-bold text-[var(--text-muted)]">
        {initials(row.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text)]">{row.name}</p>
        <p className="text-[11px] text-[var(--text-faint)]">
          {row.ringTimeout}s ring · priority {row.priority}
        </p>
      </div>
      <AvailabilityBadge status={row.availability as Availability} />
      <button
        type="button"
        onClick={() => onToggle(row.agentId)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          row.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-hover)]",
        )}
        aria-label={row.enabled ? "Disable in routing" : "Enable in routing"}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            row.enabled ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function RoutingBuilder({
  rule,
  initialRows,
  readOnly,
}: {
  rule: RoutingRule;
  initialRows: RoutingAgentRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initialRows);
  const [settings, setSettings] = useState({
    ring_timeout: rule.ring_timeout,
    max_attempts: rule.max_attempts ?? "",
    allow_repeat: rule.allow_repeat,
    mode: rule.mode,
    fallback_message: rule.fallback_message ?? "",
    after_hours_number: rule.after_hours_number ?? "",
    notify_manager_on_miss: rule.notify_manager_on_miss,
  });
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.agentId === active.id);
      const newIndex = prev.findIndex((r) => r.agentId === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  }

  function toggle(agentId: string) {
    setRows((prev) => prev.map((r) => (r.agentId === agentId ? { ...r, enabled: !r.enabled } : r)));
    setDirty(true);
  }

  async function saveOrder() {
    setSavingOrder(true);
    try {
      const res = await fetch("/api/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: rule.id,
          order: rows.map((r) => ({ agentId: r.agentId, enabled: r.enabled })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast("Routing order saved.", "success");
      setDirty(false);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSavingOrder(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: rule.id,
          ring_timeout: Number(settings.ring_timeout),
          max_attempts: settings.max_attempts === "" ? null : Number(settings.max_attempts),
          allow_repeat: settings.allow_repeat,
          mode: settings.mode,
          fallback_message: settings.fallback_message || null,
          after_hours_number: settings.after_hours_number || null,
          notify_manager_on_miss: settings.notify_manager_on_miss,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast("Routing settings saved.", "success");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader
            title="Ring order"
            subtitle="Drag to reorder. Agents ring top-to-bottom until one answers."
            icon={<PhoneMissed className="size-[18px]" />}
            action={
              !readOnly && (
                <Button size="sm" onClick={saveOrder} loading={savingOrder} disabled={!dirty}>
                  <Save className="size-3.5" /> Save order
                </Button>
              )
            }
          />
          <div className="space-y-2 p-4">
            {readOnly ? (
              rows.map((r, i) => (
                <div key={r.agentId} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <span className="text-xs font-bold text-[var(--text-faint)]">{i + 1}</span>
                  <span className="flex-1 text-sm text-[var(--text)]">{r.name}</span>
                  <AvailabilityBadge status={r.availability as Availability} />
                </div>
              ))
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={rows.map((r) => r.agentId)} strategy={verticalListSortingStrategy}>
                  {rows.map((r) => (
                    <SortableRow key={r.agentId} row={r} onToggle={toggle} />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader title="Rule settings" subtitle={rule.name} />
          <div className="space-y-4 p-4">
            <Field label="Mode">
              <Select
                value={settings.mode}
                disabled={readOnly}
                onChange={(e) => setSettings((s) => ({ ...s, mode: e.target.value as typeof s.mode }))}
              >
                <option value="sequential">Sequential priority</option>
                <option value="round_robin">Round robin</option>
              </Select>
            </Field>
            <Field label="Default ring timeout (sec)" hint="Recommended 15–20">
              <Input
                type="number"
                min={5}
                disabled={readOnly}
                value={settings.ring_timeout}
                onChange={(e) => setSettings((s) => ({ ...s, ring_timeout: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Max attempts" hint="Blank = number of eligible agents">
              <Input
                type="number"
                min={1}
                disabled={readOnly}
                value={settings.max_attempts}
                onChange={(e) => setSettings((s) => ({ ...s, max_attempts: e.target.value }))}
                placeholder="Auto"
              />
            </Field>
            <Field label="After-hours number" hint="Optional forwarding number">
              <Input
                disabled={readOnly}
                value={settings.after_hours_number}
                onChange={(e) => setSettings((s) => ({ ...s, after_hours_number: e.target.value }))}
                placeholder="+91 …"
              />
            </Field>
            <Field label="Closed / fallback message">
              <Textarea
                disabled={readOnly}
                value={settings.fallback_message}
                onChange={(e) => setSettings((s) => ({ ...s, fallback_message: e.target.value }))}
                placeholder="Message played outside office hours."
              />
            </Field>
            <div className="space-y-2.5">
              <Check label="Allow repeat attempts to same agent" checked={settings.allow_repeat} disabled={readOnly} onChange={(v) => setSettings((s) => ({ ...s, allow_repeat: v }))} />
              <Check label="Notify manager on missed call" checked={settings.notify_manager_on_miss} disabled={readOnly} onChange={(v) => setSettings((s) => ({ ...s, notify_manager_on_miss: v }))} />
            </div>
            {!readOnly && (
              <Button onClick={saveSettings} loading={savingSettings} className="w-full">
                <Save className="size-4" /> Save settings
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2.5 text-left text-sm text-[var(--text-muted)] disabled:opacity-60"
    >
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-[var(--accent)]" : "bg-[var(--surface-hover)]")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      {label}
    </button>
  );
}
