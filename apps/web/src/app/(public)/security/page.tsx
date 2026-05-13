import type { Metadata } from "next";
import { DataStorageSection } from "@/components/security/data-storage-section";
import { EncryptionSection } from "@/components/security/encryption-section";
import { GmailAccessSection } from "@/components/security/gmail-access-section";
import { OAuthScopesSection } from "@/components/security/oauth-scopes-section";
import { RelatedDocuments } from "@/components/security/related-documents";
import { SecurityHero } from "@/components/security/security-hero";
import { SecurityPrinciples } from "@/components/security/security-principles";
import { UserControlsSection } from "@/components/security/user-controls-section";
import { WhatWeNeverDoSection } from "@/components/security/what-we-never-do-section";

export const metadata: Metadata = {
  title: "Security & Privacy — ClaimIt",
  description:
    "Learn how ClaimIt handles your data securely and transparently. We prioritize user control, minimal access, and transparent workflows.",
};

export default function SecurityPage() {
  return (
    <>
      <SecurityHero />
      <SecurityPrinciples />
      <GmailAccessSection />
      <OAuthScopesSection />
      <DataStorageSection />
      <EncryptionSection />
      <WhatWeNeverDoSection />
      <UserControlsSection />
      <RelatedDocuments />
    </>
  );
}
