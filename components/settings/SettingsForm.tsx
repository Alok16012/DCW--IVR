"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { BusinessHour, Organization } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SettingsForm({
  organization,
  hours,
}: {
  organization: Organization;
  hours: BusinessHour[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [rows, setRows] = useState(() =>
    Array.from({ length: 7 }, (_, d) => {
      const h = hours.find((x) => x.day_of_week === d);
      return {
        day_of_week: d,
        open_time: h?.open_time?.slice(0, 5) ?? "09:00",
        close_time: h?.close_time?.slice(0, 5) ?? "18:00",
        enabled: h?.enabled ?? d !== 0,
      };
    }),
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization: { name, timezone }, businessHours: rows }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast("Settings saved.", "success");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Organization profile" subtitle="Company name and operating time zone." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Company name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Time zone" hint="Routing follows this clock">
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Office hours" subtitle="Calls outside these hours create a callback (PRD §7.4)." />
        <div className="space-y-2 p-5">
          {rows.map((r, i) => (
            <div
              key={r.day_of_week}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3",
                !r.enabled && "opacity-60",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, enabled: !x.enabled } : x)))
                }
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  r.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-hover)]",
                )}
                aria-label={`Toggle ${DAYS[r.day_of_week]}`}
              >
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-transform", r.enabled ? "translate-x-4" : "translate-x-0.5")} />
              </button>
              <span className="w-24 text-sm font-medium text-[var(--text)]">{DAYS[r.day_of_week]}</span>
              {r.enabled ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={r.open_time}
                    onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, open_time: e.target.value } : x)))}
                    className="h-9 w-32"
                  />
                  <span className="text-[var(--text-faint)]">–</span>
                  <Input
                    type="time"
                    value={r.close_time}
                    onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, close_time: e.target.value } : x)))}
                    className="h-9 w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-[var(--text-faint)]">Closed</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          <Save className="size-4" /> Save settings
        </Button>
      </div>
    </div>
  );
}
