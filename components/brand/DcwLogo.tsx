import { cn } from "@/lib/utils";

// DCW (Distance Courses Wala) mark — a blue crest with a graduation cap,
// rendered as inline SVG so it stays crisp at any size and needs no asset file.
export function DcwLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 112" className={cn("shrink-0", className)} role="img" aria-label="DCW logo">
      <defs>
        <linearGradient id="dcwShield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f6fe4" />
          <stop offset="100%" stopColor="#1a4bb5" />
        </linearGradient>
        <linearGradient id="dcwCap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1220" />
          <stop offset="100%" stopColor="#0f1b33" />
        </linearGradient>
      </defs>

      {/* crest */}
      <path
        d="M48 3 L86 15 C88 44 84 78 48 108 C12 78 8 44 10 15 Z"
        fill="url(#dcwShield)"
        stroke="#0b1220"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* inner panel */}
      <path
        d="M48 12 L78 21 C79 45 76 72 48 97 C20 72 17 45 18 21 Z"
        fill="#ffffff"
        opacity="0.96"
      />

      {/* graduation cap */}
      <g>
        {/* mortarboard */}
        <path d="M48 34 L74 45 L48 56 L22 45 Z" fill="url(#dcwCap)" />
        {/* cap base */}
        <path d="M35 50 L35 62 C35 69 61 69 61 62 L61 50 L48 55 Z" fill="url(#dcwCap)" />
        {/* tassel */}
        <path d="M74 45 L74 60" stroke="#0b1220" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="74" cy="62" r="3.4" fill="#2f6fe4" stroke="#0b1220" strokeWidth="1.6" />
      </g>

      {/* wordmark tab */}
      <rect x="30" y="74" width="36" height="12" rx="6" fill="#2f6fe4" />
      <text
        x="48"
        y="83"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill="#ffffff"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="1"
      >
        DCW
      </text>
    </svg>
  );
}
