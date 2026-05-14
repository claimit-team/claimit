import type { Metadata } from "next";
import { AssistantSection } from "@/components/landing/assistant-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { OutputTypesSection } from "@/components/landing/output-types-section";
import { SocialProofSection } from "@/components/landing/social-proof-section";

export const metadata: Metadata = {
  title: "ClaimIt — Post-purchase price protection",
  description:
    "ClaimIt watches eligible post-purchase price protection windows, drafts the right claim material, and keeps you in control before anything is sent.",
};

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <OutputTypesSection />
      <AssistantSection />
      <SocialProofSection />
      <FinalCtaSection />
    </>
  );
}
