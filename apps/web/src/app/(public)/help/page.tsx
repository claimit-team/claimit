import type { Metadata } from "next";
import { HelpCenterView } from "@/components/help/help-view";

export const metadata: Metadata = {
  title: "Help — ClaimIt",
  description:
    "Search FAQs about Gmail, monitoring, claims, billing, privacy, and supported platforms.",
};

export default function HelpPage() {
  return <HelpCenterView />;
}
