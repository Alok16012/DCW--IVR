import Image from "next/image";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
        <Image
          src="/brand/dcw-logo.png"
          alt="DCW logo"
          width={80}
          height={80}
          className="h-full w-full object-cover"
          priority
        />
      </span>
      {!compact && (
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-tight text-[var(--text)]">DCW-IVR</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-faint)]">
            Distance Courses Wala
          </p>
        </div>
      )}
    </div>
  );
}
