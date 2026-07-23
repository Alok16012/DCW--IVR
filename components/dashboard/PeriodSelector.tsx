"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/period";
import { cn } from "@/lib/utils";

const ORDER: PeriodKey[] = ["today", "yesterday", "7d", "30d"];

export function PeriodSelector({ current }: { current: PeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(key: PeriodKey) {
    const sp = new URLSearchParams(params.toString());
    sp.set("period", key);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
      {ORDER.map((key) => (
        <button
          key={key}
          onClick={() => select(key)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            current === key
              ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/25"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {PERIOD_LABELS[key]}
        </button>
      ))}
    </div>
  );
}
