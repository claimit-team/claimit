/**
 * PlatformLogo — renders a brand logo inside an always-light rounded chip.
 *
 * Why a hardcoded white chip and `<img>` (not theme variable + inline SVG):
 * - Brand SVGs are colored (Walmart blue, Amazon orange, etc.) and many
 *   include white-or-near-white elements designed for a light background.
 *   Rendering them on a dark theme background would visually destroy them,
 *   so the chip itself is locked to a light surface regardless of theme.
 * - Several brand SVGs share generic class names (`.st0` / `.cls-1`) and
 *   `<linearGradient id="SVGID_*">` ids. Inlining them into the same
 *   document would collide IDs across logos on the same page. Rendering
 *   via `<img>` puts each SVG in its own document, isolating styles and
 *   IDs cleanly.
 *
 * Fallback strategy:
 * - On image load failure (asset missing, network error, network-isolated
 *   preview env), swap to a Lucide icon picked by Purchase category. A
 *   null category falls through to `Store` as a safe generic.
 */

"use client";

import type { Category, Platform } from "@claimit/mongodb-types";
import { Hotel, Plane, ShoppingBag, Store } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type PlatformLogoProps = {
  platform: Platform;
  category: Category | null;
  className?: string;
};

function FallbackIcon({ category }: { category: Category | null }) {
  switch (category) {
    case "retail":
      return <ShoppingBag className="h-4 w-4 text-neutral-600" aria-hidden />;
    case "airline":
      return <Plane className="h-4 w-4 text-neutral-600" aria-hidden />;
    case "hotel":
      return <Hotel className="h-4 w-4 text-neutral-600" aria-hidden />;
    default:
      return <Store className="h-4 w-4 text-neutral-600" aria-hidden />;
  }
}

export function PlatformLogo({ platform, category, className }: PlatformLogoProps) {
  const [errored, setErrored] = useState(false);
  const src = `/platformlogo/${platform}.svg`;

  return (
    <div
      className={cn(
        // Always-light chip — hardcoded `bg-white` and a soft neutral
        // border (NOT a theme variable) so colored brand logos never
        // vanish in dark mode.
        "flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white",
        className,
      )}
      // The platform name itself is the alt text for screen readers; the
      // visual logo is decorative inside the chip.
      aria-label={platform}
      role="img"
    >
      {errored ? (
        <FallbackIcon category={category} />
      ) : (
        // biome-ignore lint/performance/noImgElement: brand SVGs need document-isolated rendering to avoid id/class collisions across logos on the same page; next/image cannot solve that and adds optimisation overhead for tiny static assets.
        <img
          src={src}
          alt=""
          className="h-5 max-w-[40px] object-contain"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
