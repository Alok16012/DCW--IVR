"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Brand } from "@/components/Brand";
import { navItemsForRole } from "@/lib/nav";
import type { Role } from "@/lib/status";
import { cn } from "@/lib/utils";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : null;
}

export function Sidebar({
  role,
  badges,
  providerLive,
}: {
  role: Role;
  badges: { callbacks: number; calls: number };
  providerLive: boolean;
}) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]/70 lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--accent-soft)] text-[var(--text)] ring-1 ring-inset ring-[var(--accent)]/25"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              )}
            >
              <Icon
                name={item.icon}
                className={cn("size-[18px]", active ? "text-[var(--accent)]" : "text-[var(--text-faint)]")}
              />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              providerLive ? "bg-[var(--success)]" : "bg-[var(--warning)]",
            )}
          />
          <p className="text-xs font-semibold text-[var(--text)]">
            {providerLive ? "Telephony live" : "Simulation mode"}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {providerLive
            ? "Exotel provider connected."
            : "Mock provider active. Add Exotel credentials to place real PSTN calls."}
        </p>
      </div>
    </aside>
  );
}
