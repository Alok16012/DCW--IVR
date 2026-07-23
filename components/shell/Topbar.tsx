"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Phone, ChevronDown, LogOut, Menu, X } from "lucide-react";
import { navItemsForRole } from "@/lib/nav";
import { ROLE_META, type Role } from "@/lib/status";
import { initials, cn } from "@/lib/utils";
import { OutboundCallModal } from "@/components/OutboundCallModal";
import { Button } from "@/components/ui/Button";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : null;
}

export function Topbar({
  name,
  role,
  businessNumber,
  canCallOut,
  callbackBadge,
}: {
  name: string;
  role: Role;
  businessNumber: string;
  canCallOut: boolean;
  callbackBadge: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/80 px-4 backdrop-blur-md lg:px-6">
        <button
          onClick={() => setMobileNav(true)}
          className="grid size-9 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        <div className="hidden items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 sm:flex">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)]">
            <Phone className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
              Official business number
            </p>
            <p className="text-sm font-semibold text-[var(--text)]">{businessNumber}</p>
          </div>
          <span className="ml-1 flex items-center gap-1.5 text-xs text-[var(--success)]">
            <span className="size-1.5 rounded-full bg-[var(--success)]" /> Online
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {canCallOut && (
            <Button onClick={() => setCallOpen(true)} size="md" className="gap-2">
              <Icons.PhoneOutgoing className="size-4" />
              <span className="hidden sm:inline">Start outbound call</span>
              <span className="sm:hidden">Call</span>
            </Button>
          )}

          <Link
            href="/callbacks"
            className="relative grid size-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-label="Callbacks"
          >
            <Icons.Bell className="size-[18px]" />
            {callbackBadge > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
                {callbackBadge}
              </span>
            )}
          </Link>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-1.5 pr-2.5 hover:bg-[var(--surface-hover)]"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-strong)] text-xs font-bold text-white">
                {initials(name)}
              </span>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-xs font-semibold text-[var(--text)]">{name}</p>
                <p className="text-[10px] text-[var(--text-faint)]">{ROLE_META[role].label}</p>
              </div>
              <ChevronDown className="size-4 text-[var(--text-faint)]" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="animate-in absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-xl">
                  <div className="px-2.5 py-2">
                    <p className="text-xs font-semibold text-[var(--text)]">{name}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">{ROLE_META[role].label}</p>
                  </div>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    >
                      <LogOut className="size-4" /> Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* mobile nav drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
          <div className="animate-in absolute left-0 top-0 h-full w-72 border-r border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-sm font-semibold text-[var(--text)]">Menu</span>
              <button onClick={() => setMobileNav(false)} aria-label="Close">
                <X className="size-5 text-[var(--text-muted)]" />
              </button>
            </div>
            <nav className="mt-2 space-y-1">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNav(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--text)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
                    )}
                  >
                    <Icon name={item.icon} className="size-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <OutboundCallModal open={callOpen} onClose={() => setCallOpen(false)} />
    </>
  );
}
