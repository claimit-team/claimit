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

import { useEffect, useState } from "react";

import { ApproveConfirmDialog } from "@/components/claims/approve-confirm-dialog";
import { AssistantPane } from "@/components/claims/assistant-pane";
import { CancelConfirmDialog } from "@/components/claims/cancel-confirm-dialog";
import { ClaimHeader } from "@/components/claims/claim-header";
import type { DraftMode } from "@/components/claims/draft-pane";
import { DraftPane } from "@/components/claims/draft-pane";
import { EvidencePane } from "@/components/claims/evidence-pane";
import { PostApproveBanner } from "@/components/claims/post-approve-banner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ClaimDetailDoc } from "@/lib/api/claims";
import type { ClaimDetail } from "@/lib/claim-detail-types";
import { useUIStore } from "@/store";

interface ClaimDetailShellProps {
  /** Derived view-model (built from the page-owned wire response). */
  claim: ClaimDetail;
  /** Re-pull server truth; pair with `applyOptimistic` in write paths. */
  refetch: () => Promise<void>;
  /** Shallow-merge a partial wire claim and re-derive the VM. */
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
}

export function ClaimDetailShell({ claim, refetch, applyOptimistic }: ClaimDetailShellProps) {
  const [paneMax, setPaneMax] = useState<"draft" | "evidence" | null>(null);
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
  useEffect(() => {
    setEditBuffer(currentDraftContent);
  }, [currentDraftContent]);

  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const handleClickEdit = () => {
    // Jump to the latest version before flipping to edit mode — older
    // versions are read-only in DraftPane (it forces preview-only via
    // a guard `useEffect`), so without this the header's "Edit draft"
    // would look broken when the user is browsing v1 of a multi-version
    // draft (CodeRabbit MINOR finding, PR #168).
    setSelectedVersion(claim.current_version);
    setDraftMode("edit");
  };
  const handleClickApprove = () => setApproveOpen(true);
  const handleClickCancel = () => setCancelOpen(true);

  const assistantExpanded = useUIStore((s) => s.claimEmbeddedAssistantExpanded);
  const setEmbeddedExpanded = useUIStore((s) => s.setClaimEmbeddedAssistantExpanded);
  const toggleEmbedded = useUIStore((s) => s.toggleClaimEmbeddedAssistant);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isTablet = useMediaQuery("(min-width: 768px)");

  // Pane-layout sync (preserved from the pre-real-ification shell —
  // this is NOT a write-action handler, do NOT delete alongside the
  // approve/cancel/edit/mark callbacks).
  //
  // The global `claimEmbeddedAssistantExpanded` flag can be flipped to
  // `true` from OUTSIDE this component — specifically the floating
  // assistant pill in `components/layout/floating-assistant.tsx` which
  // calls `toggleClaimEmbeddedAssistant` on the same UI store. When it
  // flips while the user has evidence maximized, the desktop layout
  // ternary below would otherwise pin the assistant to the 10% bottom
  // row because `evidenceFull` wins:
  //
  //   const rightTop    = evidenceFull ? 90 : assistantExpanded ? 10 : 60;
  //   const rightBottom = evidenceFull ? 10 : assistantExpanded ? 90 : 40;
  //
  // Releasing `paneMax` from `"evidence"` lets the assistantExpanded
  // branch take effect so the pane actually grows.
  useEffect(() => {
    if (assistantExpanded) setPaneMax((prev) => (prev === "evidence" ? null : prev));
  }, [assistantExpanded]);

  const toggleHorizontalMax = () => {
    setPaneMax((prev) => (prev === "draft" ? null : "draft"));
  };

  const toggleEvidenceMax = () => {
    setPaneMax((prev) => {
      const next = prev === "evidence" ? null : "evidence";
      return next;
    });
    setEmbeddedExpanded(false);
  };

  const renderDesktopLayout = () => {
    const defaultSizes = paneMax === "draft" ? [80, 20] : [40, 60];

    const evidenceFull = paneMax === "evidence";
    const rightTop = evidenceFull ? 90 : assistantExpanded ? 10 : 60;
    const rightBottom = evidenceFull ? 10 : assistantExpanded ? 90 : 40;

    return (
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={defaultSizes[0]} minSize={20}>
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
            onDoubleClickHeader={toggleHorizontalMax}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={defaultSizes[1]} minSize={20}>
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel defaultSize={rightTop} minSize={15}>
              <EvidencePane claim={claim} onDoubleClickHeader={toggleEvidenceMax} />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={rightBottom} minSize={15}>
              <AssistantPane
                claimId={claim.claim_id}
                refetch={refetch}
                onDoubleClickHeader={() => {
                  toggleEmbedded();
                  setPaneMax(null);
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
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={50} minSize={30}>
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
              <AssistantPane claimId={claim.claim_id} refetch={refetch} />
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
        <div className="border-neutral-200 border-b px-4">
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
          />
        </TabsContent>
        <TabsContent value="evidence" className="m-0 flex-1 overflow-hidden">
          <EvidencePane claim={claim} />
        </TabsContent>
        <TabsContent value="assistant" className="m-0 flex-1 overflow-hidden">
          <AssistantPane claimId={claim.claim_id} refetch={refetch} />
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
      />

      <PostApproveBanner claim={claim} />

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
