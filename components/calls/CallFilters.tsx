"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Download, X } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CALL_STATUS_META } from "@/lib/status";

type AgentOpt = { id: string; name: string };

export function CallFilters({ agents }: { agents: AgentOpt[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(params.toString());
      if (value) sp.set(key, value);
      else sp.delete(key);
      sp.delete("page");
      router.push(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  const hasFilters = ["search", "direction", "status", "agentId", "from", "to"].some((k) => params.get(k));
  const exportHref = `/api/calls/export?${params.toString()}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-faint)]" />
        <Input
          defaultValue={params.get("search") ?? ""}
          onKeyDown={(e) => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
          placeholder="Search caller or destination number…"
          className="pl-9"
        />
      </div>

      <Select defaultValue={params.get("direction") ?? ""} onChange={(e) => setParam("direction", e.target.value)} className="w-auto min-w-[130px]">
        <option value="">All directions</option>
        <option value="inbound">Inbound</option>
        <option value="outbound">Outbound</option>
      </Select>

      <Select defaultValue={params.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)} className="w-auto min-w-[130px]">
        <option value="">All statuses</option>
        {Object.entries(CALL_STATUS_META).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Select>

      <Select defaultValue={params.get("agentId") ?? ""} onChange={(e) => setParam("agentId", e.target.value)} className="w-auto min-w-[140px]">
        <option value="">All agents</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          <X className="size-3.5" /> Clear
        </Button>
      )}

      <a href={exportHref} className="ml-auto">
        <Button variant="secondary" size="md">
          <Download className="size-4" /> Export CSV
        </Button>
      </a>
    </div>
  );
}
