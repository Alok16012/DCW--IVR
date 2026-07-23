import * as Icons from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : null;
}

export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "accent",
  emphasis = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  tone?: "accent" | "success" | "warning" | "danger" | "info";
  emphasis?: boolean;
}) {
  const toneColor = {
    accent: "text-[var(--accent)] bg-[var(--accent-soft)]",
    success: "text-[var(--success)] bg-[var(--success-soft)]",
    warning: "text-[var(--warning)] bg-[var(--warning-soft)]",
    danger: "text-[var(--danger)] bg-[var(--danger-soft)]",
    info: "text-[var(--info)] bg-[var(--info-soft)]",
  }[tone];

  return (
    <Card className={cn("p-4", emphasis && "ring-1 ring-inset ring-[var(--accent)]/20")}>
      <div className="flex items-start justify-between">
        <span className={cn("grid size-9 place-items-center rounded-xl", toneColor)}>
          <Icon name={icon} className="size-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--text)]">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-[var(--text-muted)]">{label}</p>
      {sub && <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">{sub}</p>}
    </Card>
  );
}
