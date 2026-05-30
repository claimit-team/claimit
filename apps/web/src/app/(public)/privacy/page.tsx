import type { Metadata } from "next";

import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { PRIVACY_CONTENT } from "@/lib/legal/privacy-content";

export const metadata: Metadata = {
  title: "Privacy Policy | ClaimIt",
  description: PRIVACY_CONTENT.description,
};

export default function PrivacyPage() {
  return <LegalDocumentView {...PRIVACY_CONTENT} />;
}
