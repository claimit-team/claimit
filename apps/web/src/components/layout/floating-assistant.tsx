"use client";

import { MessageSquareText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

type FloatingAssistantProps = {
  /** On claim detail, FAB becomes a slim pill toggling embedded pane expansion (batch 6) */
  variant?: "default" | "pill";
};

/**
 * Floating Assistant button + placeholder slide-over (default variant).
 * On claim detail routes, renders a pill that expands the embedded assistant column.
 */
export function FloatingAssistant({ variant = "default" }: FloatingAssistantProps) {
  const open = useUIStore((s) => s.assistantPaneOpen);
  const toggle = useUIStore((s) => s.toggleAssistantPane);
  const hasProactiveEvent = useUIStore((s) => s.hasProactiveEvent);

  const embeddedExpanded = useUIStore((s) => s.claimEmbeddedAssistantExpanded);
  const toggleEmbedded = useUIStore((s) => s.toggleClaimEmbeddedAssistant);

  if (variant === "pill") {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          type="button"
          onClick={toggleEmbedded}
          aria-expanded={embeddedExpanded}
          aria-label={embeddedExpanded ? "Shrink assistant panel" : "Expand assistant panel"}
          className={cn(
            "h-11 rounded-full shadow-lg px-4 gap-2 transition-colors inline-flex items-center justify-center border border-neutral-200",
            embeddedExpanded
              ? "bg-neutral-800 text-neutral-0 hover:bg-neutral-700"
              : "bg-neutral-0 text-neutral-900 hover:bg-neutral-50",
          )}
        >
          {embeddedExpanded ? (
            <>
              <X className="w-5 h-5 shrink-0" aria-hidden />
              <span className="text-sm font-medium">Shrink</span>
            </>
          ) : (
            <>
              <MessageSquareText className="w-5 h-5 shrink-0 text-brand-primary-600" aria-hidden />
              <span className="text-sm font-medium text-neutral-900">Assistant</span>
            </>
          )}
        </Button>
      </div>
    );
  }

  const showPulse = hasProactiveEvent && !open;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="relative w-12 h-12 md:w-14 md:h-14">
        {showPulse ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full ring-2 ring-brand-accent-500 animate-ping"
          />
        ) : null}
        <Button
          type="button"
          onClick={toggle}
          size="icon"
          aria-expanded={open}
          aria-controls="assistant-pane"
          aria-label={open ? "Close assistant" : "Open assistant"}
          className={cn(
            "relative w-12 h-12 md:w-14 md:h-14 rounded-full shadow-lg transition-colors",
            open
              ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-0"
              : "bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0",
          )}
        >
          {open ? (
            <X className="w-6 h-6" aria-hidden="true" />
          ) : (
            <MessageSquareText className="w-6 h-6" aria-hidden="true" />
          )}
        </Button>
      </div>

      {open ? (
        <div
          id="assistant-pane"
          role="dialog"
          aria-label="ClaimIt Assistant"
          className="absolute bottom-16 right-0 w-80 sm:w-96 bg-neutral-0 border border-neutral-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="p-4 bg-brand-primary-500 text-neutral-0">
            <h3 className="font-semibold">ClaimIt Assistant</h3>
            <p className="text-sm text-brand-primary-100">Ask me anything about your claims</p>
          </div>
          <div className="p-4 h-64 flex items-center justify-center text-sm text-neutral-500">
            Assistant coming soon (ticket 5.9 / 5.10).
          </div>
        </div>
      ) : null}
    </div>
  );
}
