"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-[var(--accent)] to-[var(--accent-strong)] text-white shadow-[0_8px_24px_-10px_var(--accent-ring)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-[var(--surface-2)] text-[var(--text)] ring-1 ring-inset ring-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
  subtle:
    "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20 hover:bg-[var(--accent)]/20",
  ghost: "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]",
  danger:
    "bg-[var(--danger-soft)] text-[var(--danger)] ring-1 ring-inset ring-[var(--danger)]/25 hover:bg-[var(--danger)]/20",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-sm gap-2 rounded-xl",
  icon: "size-9 rounded-lg justify-center",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center font-medium transition-all duration-150 select-none",
        "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
});
