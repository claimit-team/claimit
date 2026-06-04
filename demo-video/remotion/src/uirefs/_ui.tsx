// ─────────────────────────────────────────────────────────────────────────
// uiref primitives — faithful re-implementations of apps/web shadcn/base-ui
// components. We can't import the real ones (the `@/` alias + base-ui client
// runtime + cn/twMerge live in apps/web), but the Remotion globals.css does
// `@import apps/web globals.css` + `@source apps/web`, so the SAME Tailwind
// utility classes resolve to the SAME tokens. Class strings below are copied
// verbatim from apps/web/src/components/ui/* so output is pixel-identical.
// ─────────────────────────────────────────────────────────────────────────
import type { CSSProperties, ReactNode } from "react";
import { staticFile } from "remotion";

export const cn = (...a: Array<string | false | null | undefined>) =>
  a.filter(Boolean).join(" ");

// ── Button (apps/web/src/components/ui/button.tsx, verbatim CVA) ───────────
const BTN_BASE =
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
const BTN_VARIANT: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  outline: "border-border bg-background hover:bg-muted hover:text-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  ghost: "hover:bg-muted hover:text-foreground",
  destructiveSolid: "bg-semantic-danger text-white",
};
const BTN_SIZE: Record<string, string> = {
  default: "h-8 gap-1.5 px-2.5",
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
  icon: "size-8",
};

export function Btn({
  variant = "default",
  size = "default",
  className,
  children,
  style,
}: {
  variant?: keyof typeof BTN_VARIANT;
  size?: keyof typeof BTN_SIZE;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className={cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)} style={style}>
      {children}
    </span>
  );
}

// ── Card (apps/web/src/components/ui/card.tsx, verbatim) ───────────────────
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10",
        className,
      )}
    >
      {children}
    </div>
  );
}
export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid auto-rows-min items-start gap-1 rounded-t-xl px-4", className)}>{children}</div>;
}
export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("font-heading text-base leading-snug font-medium", className)}>{children}</div>
  );
}
export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4", className)}>{children}</div>;
}

// ── Badge (apps/web/src/components/ui/badge.tsx) ───────────────────────────
const BADGE_BASE =
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3";
const BADGE_VARIANT: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border-border text-foreground",
};
export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: keyof typeof BADGE_VARIANT;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn(BADGE_BASE, BADGE_VARIANT[variant], className)}>{children}</span>;
}

// ── ClaimOutcomeBadge (claim-outcome-badge.tsx + lib/badge-styles.ts).
// Pre-resolved to final classes (BADGE_BASE_CLASSES wins over CVA defaults
// via twMerge in prod; we write the merged result directly).
const OUTCOME_BASE =
  "inline-flex items-center justify-center border text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap min-w-[6.5rem] text-center";
const OUTCOME_MAP: Record<string, { label: string; cls: string }> = {
  draft_pending: { label: "Draft pending", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  pending: { label: "Submitted", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700 border-green-200" },
  denied: { label: "Denied", cls: "bg-semantic-danger text-white border-transparent" },
};
export function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOME_MAP[outcome] ?? { label: outcome, cls: "bg-neutral-100 text-neutral-600 border-neutral-200" };
  return <span className={cn(OUTCOME_BASE, o.cls)}>{o.label}</span>;
}

// ── PlatformLogo (claims/platform-logo.tsx) — white chip + brand SVG from
// public/platformlogo/<platform>.svg (served via staticFile).
export function PlatformLogo({ platform, className }: { platform: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white",
        className,
      )}
    >
      {/* biome-ignore lint/performance/noImgElement: static brand asset */}
      <img
        src={staticFile(`platformlogo/${platform}.svg`)}
        alt=""
        className="h-5 max-w-[40px] object-contain"
      />
    </div>
  );
}
