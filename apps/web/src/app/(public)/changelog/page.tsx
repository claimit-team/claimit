import type { Metadata } from "next";
import { ChangelogHero } from "@/components/changelog/changelog-hero";
import { ChangelogTimeline } from "@/components/changelog/changelog-timeline";
import { CurrentStatusCard } from "@/components/changelog/current-status-card";
import { FinalCTA } from "@/components/changelog/final-cta";
import { ProductPrinciplesCallout } from "@/components/changelog/product-principles-callout";
import { RelatedLinks } from "@/components/changelog/related-links";

export const metadata: Metadata = {
  title: "Changelog — ClaimIt",
  description:
    "Product updates, interface changes, and implementation notes as ClaimIt moves from MVP to working demo.",
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <ChangelogHero />
      <CurrentStatusCard />
      <ChangelogTimeline />
      <ProductPrinciplesCallout />
      <RelatedLinks />
      <FinalCTA />
    </div>
  );
}
