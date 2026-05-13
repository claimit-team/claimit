import type { Metadata } from "next";
import { PrivacyPolicyView } from "@/components/privacy/privacy-policy-view";

export const metadata: Metadata = {
  title: "Privacy Policy — ClaimIt",
  description:
    "How ClaimIt handles purchase-related data, account information, Gmail access, claim materials, and user-reported outcomes.",
};

export default function PrivacyPage() {
  return <PrivacyPolicyView />;
}
