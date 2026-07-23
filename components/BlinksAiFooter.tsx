import { cn } from "@/lib/utils";
import { BlinksAiLogo } from "@/components/brand/BlinksAiLogo";

// Subtle maker's mark. DCW is the customer/brand; Blinks AI is the firm that
// built the product. Kept understated so it never competes with DCW branding.
export function BlinksAiFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[11px] text-[var(--text-faint)]",
        className,
      )}
    >
      <span>Designed &amp; developed by</span>
      <BlinksAiLogo className="h-3.5 w-auto text-[var(--text-muted)]" />
      <span aria-hidden>·</span>
      <span>© {new Date().getFullYear()} DCW · Automatic Call Routing &amp; Tracking</span>
    </footer>
  );
}
