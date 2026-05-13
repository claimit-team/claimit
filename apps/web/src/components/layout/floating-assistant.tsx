"use client";

import { MessageSquareText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

/**
 * Floating Assistant button + placeholder slide-over pane.
 * Real chat panel is wired up in tickets 5.9 / 5.10.
 * State lives in `useUIStore.assistantPaneOpen` so any page can toggle it.
 */
export function FloatingAssistant() {
  const open = useUIStore((s) => s.assistantPaneOpen);
  const toggle = useUIStore((s) => s.toggleAssistantPane);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        type="button"
        onClick={toggle}
        size="icon"
        aria-expanded={open}
        aria-controls="assistant-pane"
        aria-label={open ? "Close assistant" : "Open assistant"}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg transition-colors",
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

      {/* Placeholder slide-over — real chat content lands in 5.9/5.10. */}
      {open && (
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
      )}
    </div>
  );
}
