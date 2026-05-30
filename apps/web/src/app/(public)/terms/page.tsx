import type { Metadata } from "next";

import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { TERMS_CONTENT } from "@/lib/legal/terms-content";

export const metadata: Metadata = {
  title: "Terms of Service | ClaimIt",
  description: TERMS_CONTENT.description,
};

export default function TermsPage() {
  return <LegalDocumentView {...TERMS_CONTENT} />;
}
