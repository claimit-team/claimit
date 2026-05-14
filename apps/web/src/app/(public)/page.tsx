import type { Metadata } from "next";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { LogoWallSection } from "@/components/landing/logo-wall-section";
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
      <LogoWallSection />
      <HowItWorksSection />
      <OutputTypesSection />
      <SocialProofSection />
      <FinalCtaSection />
    </>
  );
}
