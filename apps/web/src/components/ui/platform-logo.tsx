"use client";

import { Building2, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getPlatformLogoSources } from "@/lib/platform-logos";
import { cn } from "@/lib/utils";

interface PlatformLogoProps {
  platform: string;
  /** Lucide icon shown when ALL logo sources fail or none are mapped. */
  fallbackIcon?: LucideIcon;
  /** Visual size in px. Default 30. */
  size?: number;
  className?: string;
}

export function PlatformLogo({
  platform,
  fallbackIcon: FallbackIcon = Building2,
  size = 30,
  className,
}: PlatformLogoProps) {
  const sources = useMemo(() => getPlatformLogoSources(platform), [platform]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [platform]);

  if (sourceIndex < sources.length) {
    return (
      // biome-ignore lint/performance/noImgElement: local + CDN brand SVGs; next/image adds no benefit for tiny static marks.
      <img
        key={sources[sourceIndex]}
        src={sources[sourceIndex]}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        aria-hidden
        className={cn("object-contain", className)}
        onError={() => setSourceIndex((i) => i + 1)}
      />
    );
  }

  return (
    <FallbackIcon
      aria-hidden
      className={cn("text-neutral-500", className)}
      style={{ width: size, height: size }}
    />
  );
}
