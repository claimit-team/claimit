"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { acknowledgeProactiveEvent } from "@/lib/api/conversations";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

/**
 * ProactiveCard — renders a ProactiveOutput inside the Floating Panel.
 *
 * Reads the currently-queued event from useUIStore. Dismiss fires both
 * the local store clear AND the server ack so the same notification
 * doesn't re-pop on next page load.
 *
 * Quick actions emit a custom event upward via onAction. The Floating
 * Panel maps action ids to router navigation (navigate_claim →
 * /claims/[id], etc.) — kept out of this component so the card stays
 * route-agnostic and easy to unit test.
 */
interface ProactiveCardProps {
  onAction?: (action: string) => void;
  className?: string;
}

export function ProactiveCard({ onAction, className }: ProactiveCardProps) {
  const event = useUIStore((s) => s.proactiveEvent);
  const clearProactiveEvent = useUIStore((s) => s.clearProactiveEvent);
  const [dismissing, setDismissing] = useState(false);

  if (!event) return null;

  const handleDismiss = async () => {
    setDismissing(true);
    // Clear locally first so the panel updates instantly even if the
    // server ack is slow or fails. The ack is a best-effort idempotent
    // call; swallowing errors here is safe because the bell's poll loop
    // will reconcile the unread count regardless.
    clearProactiveEvent();
    try {
      await acknowledgeProactiveEvent(event.notificationId);
    } catch {
      // Best-effort.
    } finally {
      setDismissing(false);
    }
  };

  return (
    <section
      className={cn(
        "rounded-lg border border-brand-primary-200 bg-brand-primary-50 p-4 text-neutral-900 shadow-sm",
        className,
      )}
      aria-label="Proactive assistant suggestion"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-relaxed text-neutral-900">
          {event.output.opening_message}
        </p>
        <button
          type="button"
          aria-label="Dismiss proactive suggestion"
          onClick={handleDismiss}
          disabled={dismissing}
          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-brand-primary-100 hover:text-neutral-700 disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {event.output.key_facts.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-neutral-600">
          {event.output.key_facts.map((fact) => (
            <li key={fact} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1 inline-block h-1 w-1 rounded-full bg-brand-primary-500"
              />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {event.output.quick_actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {event.output.quick_actions.map((qa) => (
            <Button
              key={qa.action}
              type="button"
              size="sm"
              variant="secondary"
              className="bg-neutral-0 text-neutral-800 hover:bg-neutral-100"
              onClick={() => onAction?.(qa.action)}
            >
              {qa.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
