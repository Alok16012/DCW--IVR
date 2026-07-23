import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <span className="grid size-12 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--text-faint)]">
          {icon}
        </span>
      )}
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-[var(--text-muted)] max-w-xs">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
