"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ThemeSelection = "light" | "dark" | "system";

const CYCLE: Record<ThemeSelection, ThemeSelection> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const SELECTION_LABEL: Record<ThemeSelection, string> = {
  light: "Theme: Light",
  dark: "Theme: Dark",
  system: "Theme: System",
};

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // `theme` is the user's selection ("light" | "dark" | "system").
  // `resolvedTheme` is the effective rendered theme ("light" | "dark") and is
  // what drives the icon. Guard with `mounted` to avoid SSR/CSR mismatch.
  const selection = (theme ?? "system") as ThemeSelection;
  const effective = resolvedTheme === "dark" ? "dark" : "light";

  const handleClick = () => {
    setTheme(CYCLE[selection]);
  };

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={handleClick}
        aria-label="Toggle theme"
        className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-neutral-200/40"
      >
        {mounted ? (
          effective === "dark" ? (
            <Sun className="size-[18px]" aria-hidden="true" />
          ) : (
            <Moon className="size-[18px]" aria-hidden="true" />
          )
        ) : (
          // Stable placeholder during hydration; size matches the icon footprint.
          <span className="size-[18px]" aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col items-start gap-0.5">
          <span>{mounted ? SELECTION_LABEL[selection] : SELECTION_LABEL.system}</span>
          <span className="text-[10px] opacity-70">Click to cycle</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
