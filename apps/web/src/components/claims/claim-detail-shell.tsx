"use client";

/**
 * /claims/[id] shell — viewer-only post-real-ification.
 *
 * Write actions are NOT wired here. Approve / Cancel / Edit draft /
 * Send now / Mark submitted / Execute / Mark result render as
 * disabled buttons with "coming soon" tooltips in `ClaimHeader`. A
 * separate immediate follow-up PR will wire these to the real
 * endpoints, avoiding fake-success local-state mutations on real
 * production claims.
 *
 * TODO(claims-detail-write-actions): wire the disabled actions to:
 *   - POST /api/v1/claims/:id/approve   (header "Approve and send")
 *   - POST /api/v1/claims/:id/cancel    (header "Cancel claim" / "Cancel")
 *   - PUT  /api/v1/claims/:id/edit      (header "Edit draft" / "Review")
 *   - <no endpoint yet>                 (MarkResultSection — manual
 *                                        outcome marking; not rendered
 *                                        on real data until a backend
 *                                        endpoint exists)
 */

import { useEffect, useState } from "react";

import { AssistantPane } from "@/components/claims/assistant-pane";
import { ClaimHeader } from "@/components/claims/claim-header";
import { DraftPane } from "@/components/claims/draft-pane";
import { EvidencePane } from "@/components/claims/evidence-pane";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ClaimDetail } from "@/lib/claim-detail-types";
import { useUIStore } from "@/store";

interface ClaimDetailShellProps {
  /**
   * The view-model claim (built from `getClaimDetail` ->
   * `buildClaimDetailViewModel`). Treated as a read-only snapshot;
   * the shell never mutates it — write actions are disabled until
   * the follow-up PR wires real endpoints (see top-of-file TODO).
   */
  initialClaim: ClaimDetail;
}

export function ClaimDetailShell({ initialClaim }: ClaimDetailShellProps) {
  const claim = initialClaim;

  const [paneMax, setPaneMax] = useState<"draft" | "evidence" | null>(null);
  const [mobileTab, setMobileTab] = useState<"draft" | "evidence" | "assistant">("draft");
  const [tabletTab, setTabletTab] = useState<"evidence" | "assistant">("evidence");

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
          <DraftPane claim={claim} onDoubleClickHeader={toggleHorizontalMax} />
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
          <DraftPane claim={claim} />
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
              <AssistantPane claimId={claim.claim_id} />
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
          <DraftPane claim={claim} />
        </TabsContent>
        <TabsContent value="evidence" className="m-0 flex-1 overflow-hidden">
          <EvidencePane claim={claim} />
        </TabsContent>
        <TabsContent value="assistant" className="m-0 flex-1 overflow-hidden">
          <AssistantPane claimId={claim.claim_id} />
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <ClaimHeader claim={claim} />

      {/*
        FIXME(claims-detail-write-actions): MarkResultSection was
        previously rendered when `claim.status === "submitted"`. It
        accepted a manual outcome (approved/denied + amount/reason)
        and mutated local state only — there is no backend endpoint
        for "manually mark outcome" today, so on real data this
        would have been a misleading fake action. Re-enable when a
        real endpoint exists.
      */}

      <div className="min-h-0 flex-1 overflow-hidden bg-neutral-50">
        {isDesktop ? renderDesktopLayout() : isTablet ? renderTabletLayout() : renderMobileLayout()}
      </div>
    </div>
  );
}
