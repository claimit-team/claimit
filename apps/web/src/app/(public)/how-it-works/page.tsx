import type { Metadata } from "next";
import { AgentWorkflowSection } from "@/components/how-it-works/agent-workflow-section";
import { ApprovalOutcomeLoop } from "@/components/how-it-works/approval-outcome-loop";
import { ClaimMaterialTypes } from "@/components/how-it-works/claim-material-types";
import { FinalCTA } from "@/components/how-it-works/final-cta";
import { HeroSection } from "@/components/how-it-works/hero-section";
import { PrivacyControlPreview } from "@/components/how-it-works/privacy-control-preview";
import { ThreeStepOverview } from "@/components/how-it-works/three-step-overview";

export const metadata: Metadata = {
  title: "How it Works | ClaimIt",
  description:
    "Learn how ClaimIt monitors post-purchase price protection windows and helps you prepare refund claims when eligible price drops are detected.",
};

export default function HowItWorksPage() {
  return (
    <>
      <HeroSection />
      <ThreeStepOverview />
      <AgentWorkflowSection />
      <ClaimMaterialTypes />
      <ApprovalOutcomeLoop />
      <PrivacyControlPreview />
      <FinalCTA />
    </>
  );
}
