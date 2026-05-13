import type { Metadata } from "next";
import { PricingView } from "@/components/pricing/pricing-view";

export const metadata: Metadata = {
  title: "Pricing — ClaimIt",
  description:
    "ClaimIt tiers from free monitoring to claim drafts with Pro and Family. Compare features and FAQs.",
};

export default function PricingPage() {
  return <PricingView />;
}
