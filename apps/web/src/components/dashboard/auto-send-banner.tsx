"use client";

/**
 * AutoSendBanner — dashboard countdown banner for claims in
 * outcome=queued_for_send (ticket 5.15 / WI-9).
 *
 * One row per queued claim, stacked vertically (max 3 visible per
 * the locked design; the overflow surfaces as "+N more sending"
 * below the visible stack). Each row renders a live MM:SS
 * countdown driven by a single component-local interval (one timer
 * for the whole stack, not per row, so a long list doesn't fork N
 * intervals).
 *
 * Data:
 *   - Store: useAutoSendBannerStore (rows + state flips).
 *   - Initial hydration: useQueuedForSendClaims (one mount-time fetch).
 *   - Live updates: useProactiveAssistant's SSE handler fans out
 *     `claim_queued_auto` → addRow and `claim_submitted` → markSent.
 *
 * Per-row state machine:
 *   - `queued`: countdown + Review / Send now / Cancel actions.
 *   - `sent`:   "Sent ✓" surface (blue --semantic-info — NOT green,
 *               which is reserved for reclaimed money), then auto-
 *               dismiss after 3s.
 *
 * H3 (race tolerance): a Send-now or Cancel that 409s
 * (claim_not_approvable / claim_not_cancellable) means the
 * scheduler beat the user to the punch — the claim has already
 * been submitted. We treat that as success: remove the row
 * silently rather than red-toast a confusing "couldn't approve"
 * error that contradicts the just-sent claim.
 *
 * Colors are locked in the plan and pinned via Tailwind tokens —
 * NO red (danger is reserved for denied/expired) and NO green
 * (reserved for reclaimed money).
 */

import { Check, Clock, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveClaim, ClaimsApiError, cancelClaim } from "@/lib/api/claims";
import { getPlatformLabel } from "@/lib/platform-labels";
import { cn } from "@/lib/utils";
import { type AutoSendBannerRow, useAutoSendBannerStore } from "@/store/auto-send-banner";

const MAX_VISIBLE_ROWS = 3;
const SENT_AUTO_DISMISS_MS = 3000;

/**
 * Single-shared countdown source for the entire banner stack. One
 * setInterval is much cheaper than N (and keeps the tick aligned
 * across rows so they advance together).
 */
function useCurrentSecond(): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatCountdown(autoSendAt: string, now: number): string {
  const target = new Date(autoSendAt).getTime();
  if (Number.isNaN(target)) return "0:00";
  const remainingMs = Math.max(0, target - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Treat 409 (claim_not_approvable / claim_not_cancellable) as success
 * per H3 — the scheduler beat us to the submission, the row is no
 * longer actionable but is also not in an error state. Other failures
 * bubble up to a small destructive toast.
 */
function isAlreadyResolvedError(err: unknown): boolean {
  return (
    err instanceof ClaimsApiError &&
    (err.code === "claim_not_approvable" || err.code === "claim_not_cancellable")
  );
}

export function AutoSendBanner() {
  const rows = useAutoSendBannerStore((s) => s.rows);
  const markSent = useAutoSendBannerStore((s) => s.markSent);
  const removeRow = useAutoSendBannerStore((s) => s.removeRow);
  const now = useCurrentSecond();

  // Auto-dismiss `sent` rows ~3s after they enter that state. The
  // timer is owned by the banner (not the store) so a remount of
  // the dashboard doesn't lose track; the cleanup unwinds the
  // scheduled removeRow if the row was already removed manually.
  useEffect(() => {
    const sentClaimIds = rows.filter((r) => r.state === "sent").map((r) => r.claimId);
    if (sentClaimIds.length === 0) return;
    const timers = sentClaimIds.map((claimId) =>
      setTimeout(() => removeRow(claimId), SENT_AUTO_DISMISS_MS),
    );
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [rows, removeRow]);

  // Optimistic 0:00 fallback: if the row is still `queued` but the
  // countdown has hit 0 and we haven't yet received the
  // claim_submitted SSE frame (worker pulse hadn't fired yet, or
  // we missed the frame on a reconnect), flip locally so the user
  // sees Sent ✓ rather than a stuck 0:00. The SSE frame (when it
  // arrives) is a no-op via store idempotency.
  useEffect(() => {
    for (const row of rows) {
      if (row.state !== "queued") continue;
      const target = new Date(row.autoSendAt).getTime();
      if (!Number.isNaN(target) && target <= now) {
        markSent(row.claimId);
      }
    }
  }, [rows, now, markSent]);

  if (rows.length === 0) return null;

  const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS);
  const overflowCount = rows.length - visibleRows.length;

  return (
    <section
      aria-label="Auto-send queue"
      className="flex flex-col gap-2"
      data-testid="auto-send-banner"
    >
      {visibleRows.map((row) => (
        <AutoSendBannerRowView key={row.claimId} row={row} now={now} />
      ))}
      {overflowCount > 0 ? (
        <p className="text-neutral-500 text-xs">+{overflowCount} more sending</p>
      ) : null}
    </section>
  );
}

function AutoSendBannerRowView({ row, now }: { row: AutoSendBannerRow; now: number }) {
  const removeRow = useAutoSendBannerStore((s) => s.removeRow);
  const [isActing, setIsActing] = useState(false);
  const platformLabel = getPlatformLabel(row.platform);

  if (row.state === "sent") {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-md border px-4 py-3 text-sm",
          "border-semantic-info/20 bg-semantic-info/10 text-semantic-info",
        )}
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-2 font-medium">
          <Check className="h-4 w-4" aria-hidden />
          Sent {platformLabel} claim
        </span>
      </div>
    );
  }

  const countdown = formatCountdown(row.autoSendAt, now);

  const handleSendNow = async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      await approveClaim(row.claimId);
      removeRow(row.claimId);
      toast.success(`${platformLabel} claim sent`);
    } catch (err) {
      if (isAlreadyResolvedError(err)) {
        // Already submitted by the scheduler — same end state, no error toast.
        removeRow(row.claimId);
        return;
      }
      const message =
        err instanceof Error ? err.message : "Could not send claim now. Please try again.";
      toast.error(message);
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = async () => {
    if (isActing) return;
    // Quick confirm — the plan's "for the banner, a quick confirm is
    // enough; reuse cancel-confirm-dialog if cheap, else a simple
    // confirm". Reusing the full dialog from a banner row would force
    // a multi-row mount-each-dialog pattern (or a host-level state
    // managed across N rows); confirm() is a single keystroke shorter
    // path for a low-stakes cancel where the reason isn't needed
    // (the dialog's required-reason picker is for the claim-page
    // flow's outcome_note).
    if (typeof window !== "undefined" && !window.confirm(`Cancel ${platformLabel} claim?`)) {
      return;
    }
    setIsActing(true);
    try {
      await cancelClaim(row.claimId, { reason: "Cancelled from auto-send banner" });
      removeRow(row.claimId);
      toast.success(`${platformLabel} claim cancelled`);
    } catch (err) {
      if (isAlreadyResolvedError(err)) {
        removeRow(row.claimId);
        return;
      }
      const message =
        err instanceof Error ? err.message : "Could not cancel claim. Please try again.";
      toast.error(message);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border px-4 py-3 text-sm",
        "border-semantic-warning/30 bg-semantic-warning-bg text-semantic-warning",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Clock className="h-4 w-4 flex-shrink-0" aria-hidden />
        <span className="truncate">
          Sending {platformLabel} claim in{" "}
          <span className="font-semibold tabular-nums">{countdown}</span>
        </span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <Link
          href={`/claims/${encodeURIComponent(row.claimId)}`}
          className={cn(
            "inline-flex items-center rounded-md px-2 py-1 text-neutral-700 text-xs hover:bg-neutral-100",
          )}
        >
          Review
        </Link>
        <Button
          size="sm"
          type="button"
          onClick={() => void handleSendNow()}
          disabled={isActing}
          className="h-8 bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0"
        >
          <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
          Send now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => void handleCancel()}
          disabled={isActing}
          className="h-8 text-neutral-700 hover:bg-neutral-100"
          aria-label="Cancel claim"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
