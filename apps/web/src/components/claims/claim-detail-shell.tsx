"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AssistantPane } from "@/components/claims/assistant-pane";
import { ClaimHeader } from "@/components/claims/claim-header";
import { DraftPane } from "@/components/claims/draft-pane";
import { EvidencePane } from "@/components/claims/evidence-pane";
import { MarkResultSection } from "@/components/claims/mark-result-section";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ClaimConversation, ClaimDetail, OutcomeStatus } from "@/lib/claim-detail-types";
import { useUIStore } from "@/store";

interface ClaimDetailShellProps {
  initialClaim: ClaimDetail;
  initialConversation: ClaimConversation;
}

export function ClaimDetailShell({ initialClaim, initialConversation }: ClaimDetailShellProps) {
  const [claim, setClaim] = useState<ClaimDetail>(initialClaim);
  const [conversation] = useState<ClaimConversation>(initialConversation);

  const [paneMax, setPaneMax] = useState<"draft" | "evidence" | null>(null);
  const [mobileTab, setMobileTab] = useState<"draft" | "evidence" | "assistant">("draft");
  const [tabletTab, setTabletTab] = useState<"evidence" | "assistant">("evidence");

  const assistantExpanded = useUIStore((s) => s.claimEmbeddedAssistantExpanded);
  const setEmbeddedExpanded = useUIStore((s) => s.setClaimEmbeddedAssistantExpanded);
  const toggleEmbedded = useUIStore((s) => s.toggleClaimEmbeddedAssistant);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isTablet = useMediaQuery("(min-width: 768px)");

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

  const handleApproveAndSend = () => {
    setClaim((prev) => ({ ...prev, status: "submitted" }));
    toast.success("Claim approved and sent");
  };

  const handleCancelClaim = () => {
    toast.info("Cancel claim — mock only");
  };

  const handleEditDraft = () => {
    if (!isDesktop && !isTablet) {
      setMobileTab("draft");
    }
    toast.info("Focused draft pane");
  };

  const handleSendNow = () => {
    setClaim((prev) => ({ ...prev, status: "submitted" }));
    toast.success("Claim sent immediately");
  };

  const handleMarkSubmitted = () => {
    setClaim((prev) => ({ ...prev, status: "submitted" }));
    toast.success("Claim marked as submitted");
  };

  const handleExecute = () => {
    toast.info("Execute — mock only");
  };

  const handleMarkResult = (result: OutcomeStatus, amount?: number, reason?: string) => {
    if (result === "approved") {
      setClaim((prev) => ({
        ...prev,
        status: "approved",
        outcome: "approved",
        outcome_amount: amount,
      }));
    } else if (result === "denied") {
      setClaim((prev) => ({
        ...prev,
        status: "denied",
        outcome: "denied",
        denial_reason: reason,
      }));
    }
  };

  const handleSendMessage = (_message: string) => {};

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
                conversation={conversation}
                onSendMessage={handleSendMessage}
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
              <AssistantPane conversation={conversation} onSendMessage={handleSendMessage} />
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
          <AssistantPane conversation={conversation} onSendMessage={handleSendMessage} />
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <ClaimHeader
        claim={claim}
        onApproveAndSend={handleApproveAndSend}
        onCancelClaim={handleCancelClaim}
        onEditDraft={handleEditDraft}
        onSendNow={handleSendNow}
        onMarkSubmitted={handleMarkSubmitted}
        onExecute={handleExecute}
      />

      {claim.status === "submitted" ? <MarkResultSection onMarkResult={handleMarkResult} /> : null}

      <div className="min-h-0 flex-1 overflow-hidden bg-neutral-50">
        {isDesktop ? renderDesktopLayout() : isTablet ? renderTabletLayout() : renderMobileLayout()}
      </div>
    </div>
  );
}
