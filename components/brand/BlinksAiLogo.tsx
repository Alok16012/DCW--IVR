import { cn } from "@/lib/utils";

// Blinks AI wordmark — the firm that developed this product. Rendered as inline
// SVG (white "blinks ai" lockup with the signature smile) so it sits cleanly on
// dark footers. `currentColor` drives the fill so callers control the tone.
export function BlinksAiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 132 44" className={cn("shrink-0", className)} role="img" aria-label="Blinks AI">
      <text
        x="0"
        y="26"
        fontSize="26"
        fontWeight="800"
        fill="currentColor"
        fontFamily="var(--font-inter), ui-sans-serif, system-ui, sans-serif"
        letterSpacing="-0.5"
      >
        blinks ai
      </text>
      {/* smile */}
      <path
        d="M20 36 Q66 50 112 36"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
