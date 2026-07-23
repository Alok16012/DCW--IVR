import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

const toneStyles: Record<Tone, string> = {
  success: "text-[var(--success)] bg-[var(--success-soft)] ring-[var(--success)]/25",
  warning: "text-[var(--warning)] bg-[var(--warning-soft)] ring-[var(--warning)]/25",
  danger: "text-[var(--danger)] bg-[var(--danger-soft)] ring-[var(--danger)]/25",
  info: "text-[var(--info)] bg-[var(--info-soft)] ring-[var(--info)]/25",
  neutral: "text-[var(--neutral)] bg-[var(--neutral-soft)] ring-[var(--neutral)]/20",
  accent: "text-[var(--accent)] bg-[var(--accent-soft)] ring-[var(--accent)]/25",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        toneStyles[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
