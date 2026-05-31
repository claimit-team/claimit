"use client";

/**
 * /claims/[id] shell — three-pane approval flow (5.7).
 *
 * The page owns the wire `ClaimDetailResponse` and exposes:
 *   - `claim`             — the derived `ClaimDetail` view-model
 *   - `refetch()`         — re-pulls server truth (single source of
 *                            truth after every write)
 *   - `applyOptimistic()` — shallow-merges a `Partial<ClaimDetailDoc>`
 *                            into the wire `claim` so the UI updates
 *                            before the network round-trip completes
 *
 * The shell threads these through to `ClaimHeader`, `DraftPane`, and
 * `AssistantPane`. WI-3 (edit/save) and WI-6/7 (approve/cancel)
 * consume them; WI-2 only sets up the plumbing.
 *
 * AssistantPane receives `refetch` but doesn't call it in 5.7 — the
 * 5.9 seam comment marks where assistant→draft redraft sync will
 * hook in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";
import { toast } from "sonner";

import { ApproveConfirmDialog } from "@/components/claims/approve-confirm-dialog";
import { AssistantPane } from "@/components/claims/assistant-pane";
import { CancelConfirmDialog } from "@/components/claims/cancel-confirm-dialog";
import { ClaimHeader } from "@/components/claims/claim-header";
import { ClaimOutcomePrompt } from "@/components/claims/claim-outcome-prompt";
import type { DraftMode } from "@/components/claims/draft-pane";
import { DraftPane } from "@/components/claims/draft-pane";
import { EvidencePane } from "@/components/claims/evidence-pane";
import { PostApproveBanner } from "@/components/claims/post-approve-banner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ClaimDetailDoc } from "@/lib/api/claims";
import type { ClaimDetail } from "@/lib/claim-detail-types";
import { EDITABLE_STATUSES } from "@/lib/claims-status";
import { useUIStore } from "@/store";
import { useClaimAssistantPromptStore } from "@/store/claim-assistant-prompt";
import {
  normalizeClaimId,
  REDRAFT_TIMEOUT_MS,
  useClaimRedraftProgressStore,
} from "@/store/claim-redraft-progress";

const LAYOUT = {
  outerDefault: { draft: 40, "right-column": 60 },
  draftMax: { draft: 80, "right-column": 20 },
  innerDefault: { evidence: 60, assistant: 40 },
  evidenceMax: { evidence: 90, assistant: 10 },
  assistantMax: { evidence: 10, assistant: 90 },
};

interface ClaimDetailShellProps {
  /** Derived view-model (built from the page-owned wire response). */
  claim: ClaimDetail;
  /** Re-pull server truth; pair with `applyOptimistic` in write paths. */
  refetch: () => Promise<void>;
  /** Shallow-merge a partial wire claim and re-derive the VM. */
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
}

export function ClaimDetailShell({ claim, refetch, applyOptimistic }: ClaimDetailShellProps) {
  const [_paneMax, setPaneMax] = useState<"draft" | "evidence" | null>(null);
  const [mobileTab, setMobileTab] = useState<"draft" | "evidence" | "assistant">("draft");
  const [tabletTab, setTabletTab] = useState<"evidence" | "assistant">("evidence");

  // ------------------------------------------------------------------
  // Shared draft-edit state (lifted from DraftPane in WI-8 so the
  // header's "Approve and send" dialog can include the in-progress
  // edit buffer as `edited_draft_content` when the user approves
  // mid-edit). DraftPane is now controlled: tabs + version selector +
  // edit buffer all route through these setters. The unsaved-changes
  // guard (pendingTab / pendingVersion) is still local to DraftPane —
  // a header-initiated edit-mode flip bypasses the guard intentionally
  // (the "Edit draft" button only renders in `awaiting_approval` which
  // can't have an in-flight edit-in-progress).
  // ------------------------------------------------------------------
  const [draftMode, setDraftMode] = useState<DraftMode>("preview");
  const [selectedVersion, setSelectedVersion] = useState(claim.current_version);
  const [editBuffer, setEditBuffer] = useState(
    claim.draft_versions[claim.current_version - 1]?.content ?? "",
  );
  const baseline = claim.draft_versions[selectedVersion - 1]?.content ?? "";
  const dirty = editBuffer !== baseline;

  const claimIdKey = normalizeClaimId(claim.claim_id);
  const redraftProgress = useClaimRedraftProgressStore((s) => s.byClaimId[claimIdKey]);
  const clearRegenerating = useClaimRedraftProgressStore((s) => s.clearRegenerating);
  const markTimedOut = useClaimRedraftProgressStore((s) => s.markTimedOut);
  const isRegenerating = redraftProgress !== undefined && !redraftProgress.timedOut;
  const regeneratingTimedOut = redraftProgress?.timedOut ?? false;

  useEffect(() => {
    if (!redraftProgress) return;
    const versionAdvanced =
      claim.current_version > redraftProgress.baselineVersion ||
      claim.draft_versions.length > redraftProgress.baselineVersion;
    if (versionAdvanced) {
      clearRegenerating(claim.claim_id);
      if (!redraftProgress.timedOut) {
        toast.success("Draft updated");
      }
      return;
    }
    if (redraftProgress.timedOut) return;
    const remaining = redraftProgress.startedAt + REDRAFT_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      // Deadline already passed (e.g. user left mid-redraft and came back later):
      // mark state timed-out but don't announce a stale failure with a toast on mount.
      markTimedOut(claim.claim_id);
      return;
    }
    const timer = window.setTimeout(() => {
      markTimedOut(claim.claim_id);
      toast.error("Couldn't redraft. Please try again.");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [
    claim.claim_id,
    claim.current_version,
    claim.draft_versions.length,
    clearRegenerating,
    markTimedOut,
    redraftProgress,
  ]);

  useEffect(() => {
    if (isRegenerating && draftMode === "edit") {
      setDraftMode("preview");
    }
  }, [isRegenerating, draftMode]);

  // Snap selectedVersion to the wire's latest after refetch (e.g. WI-3
  // Save lands a v(n+1) row; we want the user looking at that).
  useEffect(() => {
    setSelectedVersion(claim.current_version);
  }, [claim.current_version]);

  // Reset edit buffer to the selected version's content whenever the
  // version changes OR the selected version's content changes (e.g.
  // after a Save: refetched draft_versions[current_version - 1] ===
  // the freshly-saved content, so the buffer naturally lands clean).
  //
  // Narrow the dependency to the specific content cell (not the
  // whole `claim` reference): an unrelated optimistic patch
  // (e.g. approve flipping `outcome → pending`) changes the claim
  // reference but MUST NOT clobber in-progress edits in the buffer.
  // CodeRabbit MAJOR finding, PR #168.
  const currentDraftContent = claim.draft_versions[selectedVersion - 1]?.content ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedVersion is intentionally listed alongside currentDraftContent so the buffer also resets across version switches where two versions happen to share identical content (rare but possible after AI regens); without it the effect wouldn't re-fire and stale edits could carry across the flip — CodeRabbit MINOR, PR #168.
  useEffect(() => {
    setEditBuffer(currentDraftContent);
  }, [currentDraftContent, selectedVersion]);

  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (!EDITABLE_STATUSES.has(claim.status) || claim.claim_type !== "email") {
      setDraftMode("preview");
    }
  }, [claim.status, claim.claim_type]);

  const handleClickEdit = () => {
    if (!EDITABLE_STATUSES.has(claim.status)) return;
    if (claim.claim_type !== "email") return;
    // Jump to the latest version before flipping to edit mode — older
    // versions are read-only in DraftPane (it forces preview-only via
    // a guard `useEffect`), so without this the header's "Edit draft"
    // would look broken when the user is browsing v1 of a multi-version
    // draft (CodeRabbit MINOR finding, PR #168).
    setSelectedVersion(claim.current_version);
    setDraftMode("edit");
  };
  const handleClickApprove = () => {
    // Snap to the latest version before opening the approve dialog
    // (CodeRabbit MAJOR, PR #168): if the user opened Approve while
    // browsing a historical version, the dialog would otherwise
    // submit the latest server draft (because only `dirty` /
    // `editedDraftContent` are forwarded — and `dirty` is false off-
    // latest), making the approved content differ from what's on
    // screen. Pinning selection to current_version aligns the
    // visible preview with what actually gets submitted.
    setSelectedVersion(claim.current_version);
    setApproveOpen(true);
  };
  const handleClickCancel = () => setCancelOpen(true);

  /**
   * In-store guide print handler (ticket 5.16). Toggles
   * `body.printing-in-store-guide` which activates the print stylesheet
   * in `app/globals.css` (hides chrome via `[data-print-hide]`, shows
   * only the `[data-print-target]` InStoreGuide subtree, portrait
   * orientation, ink-friendly typography). The browser's print dialog
   * then handles Save-as-PDF or direct printer routing.
   *
   * `window.print()` is synchronous in modern browsers — it blocks
   * until the dialog closes — but we also bind `afterprint` to clean
   * up the body class as a defense against user-canceled previews
   * or browsers that return from `window.print()` before the dialog
   * is dismissed (older Safari).
   */
  const handleClickPrint = () => {
    document.body.classList.add("printing-in-store-guide");
    const cleanup = () => {
      document.body.classList.remove("printing-in-store-guide");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isTablet = useMediaQuery("(min-width: 768px)");

  const handleTryDifferentAngle = useCallback(() => {
    const isRegeneratingNow = useClaimRedraftProgressStore
      .getState()
      .isRegenerating(claim.claim_id);
    if (isRegeneratingNow) return;

    const reason = claim.denial_reason?.trim();
    const reasonClause = reason
      ? ` with this reason: "${reason}"`
      : " (no specific reason was recorded)";
    const prompt = `This claim was denied${reasonClause}. Please try a different angle for the claim — suggest a stronger approach and regenerate the draft with updated wording.`;

    if (!isDesktop && isTablet) setTabletTab("assistant");
    if (!isDesktop && !isTablet) setMobileTab("assistant");

    toast.info("Asking the Assistant to try a different angle…");

    useClaimAssistantPromptStore.getState().queuePrompt(claim.claim_id, prompt);
  }, [claim.claim_id, claim.denial_reason, isDesktop, isTablet]);

  const assistantExpanded = useUIStore((s) => s.claimEmbeddedAssistantExpanded);
  const setEmbeddedExpanded = useUIStore((s) => s.setClaimEmbeddedAssistantExpanded);
  const toggleEmbedded = useUIStore((s) => s.toggleClaimEmbeddedAssistant);

  const outerGroupRef = useRef<GroupImperativeHandle | null>(null);
  const innerGroupRef = useRef<GroupImperativeHandle | null>(null);

  // Pane-layout sync: the global `claimEmbeddedAssistantExpanded` flag can
  // be flipped to `true` from OUTSIDE this component — specifically the
  // floating assistant pill — so we must respond imperatively rather than
  // relying on defaultSize re-renders (which the library ignores).
  useEffect(() => {
    if (assistantExpanded) {
      setPaneMax((prev) => (prev === "evidence" ? null : prev));
      innerGroupRef.current?.setLayout(LAYOUT.assistantMax);
    }
  }, [assistantExpanded]);

  const toggleHorizontalMax = useCallback(() => {
    setPaneMax((prev) => {
      const next = prev === "draft" ? null : "draft";
      if (next === "draft") {
        outerGroupRef.current?.setLayout(LAYOUT.draftMax);
        innerGroupRef.current?.setLayout(LAYOUT.innerDefault);
      } else {
        outerGroupRef.current?.setLayout(LAYOUT.outerDefault);
      }
      return next;
    });
    setEmbeddedExpanded(false);
  }, [setEmbeddedExpanded]);

  const toggleEvidenceMax = useCallback(() => {
    setPaneMax((prev) => {
      const next = prev === "evidence" ? null : "evidence";
      if (next === "evidence") {
        innerGroupRef.current?.setLayout(LAYOUT.evidenceMax);
        outerGroupRef.current?.setLayout({ draft: 20, "right-column": 80 });
      } else {
        innerGroupRef.current?.setLayout(LAYOUT.innerDefault);
        outerGroupRef.current?.setLayout(LAYOUT.outerDefault);
      }
      return next;
    });
    setEmbeddedExpanded(false);
  }, [setEmbeddedExpanded]);

  const renderDesktopLayout = () => {
    return (
      <ResizablePanelGroup orientation="horizontal" className="h-full" groupRef={outerGroupRef}>
        <ResizablePanel id="draft" defaultSize={40} minSize={20}>
          <DraftPane
            claim={claim}
            refetch={refetch}
            applyOptimistic={applyOptimistic}
            draftMode={draftMode}
            setDraftMode={setDraftMode}
            selectedVersion={selectedVersion}
            setSelectedVersion={setSelectedVersion}
            editBuffer={editBuffer}
            setEditBuffer={setEditBuffer}
            dirty={dirty}
            isRegenerating={isRegenerating}
            regeneratingTimedOut={regeneratingTimedOut}
            onDoubleClickHeader={toggleHorizontalMax}
          />
        </ResizablePanel>

        <ResizableHandle withHandle data-print-hide />

        {/* Right-hand pane (Evidence + Assistant + their inner handle):
            entire subtree collapsed by 5.16 print stylesheet so the
            DraftPane (which contains the [data-print-target] InStoreGuide)
            fills the page. */}
        <ResizablePanel id="right-column" defaultSize={60} minSize={20} data-print-hide>
          <ResizablePanelGroup orientation="vertical" className="h-full" groupRef={innerGroupRef}>
            <ResizablePanel id="evidence" defaultSize={60} minSize={15}>
              <EvidencePane claim={claim} onDoubleClickHeader={toggleEvidenceMax} />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="assistant" defaultSize={40} minSize={15}>
              <AssistantPane
                claimId={claim.claim_id}
                currentVersion={claim.current_version}
                refetch={refetch}
                onDoubleClickHeader={() => {
                  const willExpand = !assistantExpanded;
                  toggleEmbedded();
                  setPaneMax(null);
                  if (willExpand) {
                    innerGroupRef.current?.setLayout(LAYOUT.assistantMax);
                    outerGroupRef.current?.setLayout({ draft: 20, "right-column": 80 });
                  } else {
                    innerGroupRef.current?.setLayout(LAYOUT.innerDefault);
                    outerGroupRef.current?.setLayout(LAYOUT.outerDefault);
                  }
                }}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  };

  const renderTabletLayout = () => {
    return (
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={50} minSize={30}>
          <DraftPane
            claim={claim}
            refetch={refetch}
            applyOptimistic={applyOptimistic}
            draftMode={draftMode}
            setDraftMode={setDraftMode}
            selectedVersion={selectedVersion}
            setSelectedVersion={setSelectedVersion}
            editBuffer={editBuffer}
            setEditBuffer={setEditBuffer}
            dirty={dirty}
            isRegenerating={isRegenerating}
            regeneratingTimedOut={regeneratingTimedOut}
          />
        </ResizablePanel>

        <ResizableHandle withHandle data-print-hide />

        {/* Tablet right pane = Evidence/Assistant tab pair — fully
            collapsed in 5.16 print mode (same rationale as desktop). */}
        <ResizablePanel defaultSize={50} minSize={30} data-print-hide>
          <Tabs
            value={tabletTab}
            onValueChange={(v) => setTabletTab(v as "evidence" | "assistant")}
            className="flex h-full flex-col"
          >
            <div className="border-neutral-200 border-b px-4">
              <TabsList className="h-10 bg-transparent">
                <TabsTrigger value="evidence" className="data-active:bg-neutral-100">
                  Evidence
                </TabsTrigger>
                <TabsTrigger value="assistant" className="data-active:bg-neutral-100">
                  Assistant
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="evidence" className="m-0 flex-1 overflow-hidden">
              <EvidencePane claim={claim} />
            </TabsContent>
            <TabsContent value="assistant" className="m-0 flex-1 overflow-hidden">
              <AssistantPane
                claimId={claim.claim_id}
                currentVersion={claim.current_version}
                refetch={refetch}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  };

  const renderMobileLayout = () => {
    return (
      <Tabs
        value={mobileTab}
        onValueChange={(v) => setMobileTab(v as "draft" | "evidence" | "assistant")}
        className="flex h-full flex-col"
      >
        <div className="border-neutral-200 border-b px-4" data-print-hide>
          <TabsList className="h-10 w-full bg-transparent">
            <TabsTrigger value="draft" className="flex-1 data-active:bg-neutral-100">
              Draft
            </TabsTrigger>
            <TabsTrigger value="evidence" className="flex-1 data-active:bg-neutral-100">
              Evidence
            </TabsTrigger>
            <TabsTrigger value="assistant" className="flex-1 data-active:bg-neutral-100">
              Assistant
            </TabsTrigger>
          </TabsList>
        </div>
        {/* Draft tab: the [data-print-target] InStoreGuide lives inside
            this TabsContent. The 5.16 print stylesheet uses :has() to
            force-show this panel even when the user is currently on a
            different mobile tab — so clicking Download PDF on the
            Evidence tab still prints the guide, not an empty page. */}
        <TabsContent value="draft" className="m-0 flex-1 overflow-hidden">
          <DraftPane
            claim={claim}
            refetch={refetch}
            applyOptimistic={applyOptimistic}
            draftMode={draftMode}
            setDraftMode={setDraftMode}
            selectedVersion={selectedVersion}
            setSelectedVersion={setSelectedVersion}
            editBuffer={editBuffer}
            setEditBuffer={setEditBuffer}
            dirty={dirty}
            isRegenerating={isRegenerating}
            regeneratingTimedOut={regeneratingTimedOut}
          />
        </TabsContent>
        <TabsContent value="evidence" className="m-0 flex-1 overflow-hidden" data-print-hide>
          <EvidencePane claim={claim} />
        </TabsContent>
        <TabsContent value="assistant" className="m-0 flex-1 overflow-hidden" data-print-hide>
          <AssistantPane
            claimId={claim.claim_id}
            currentVersion={claim.current_version}
            refetch={refetch}
          />
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <ClaimHeader
        claim={claim}
        onClickEdit={handleClickEdit}
        onClickCancel={handleClickCancel}
        onClickApprove={handleClickApprove}
        onClickPrint={handleClickPrint}
        onClickTryDifferentAngle={handleTryDifferentAngle}
      />

      {/* Banner + outcome prompt are post-action surfaces that have no
          place on the printed in-store guide — `data-print-hide` per
          5.16 (see globals.css print stylesheet). */}
      <div data-print-hide>
        <PostApproveBanner claim={claim} />
        <ClaimOutcomePrompt claim={claim} refetch={refetch} applyOptimistic={applyOptimistic} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-neutral-50">
        {isDesktop ? renderDesktopLayout() : isTablet ? renderTabletLayout() : renderMobileLayout()}
      </div>

      <ApproveConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        claim={claim}
        dirty={dirty}
        editedDraftContent={editBuffer}
        applyOptimistic={applyOptimistic}
        refetch={refetch}
      />
      <CancelConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        claim={claim}
        applyOptimistic={applyOptimistic}
        refetch={refetch}
      />
    </div>
  );
}
