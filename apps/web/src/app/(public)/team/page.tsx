import type { Metadata } from "next";
import { CareersTeaser } from "@/components/team/careers-teaser";
import { FinalCta } from "@/components/team/final-cta";
import { TeamHero } from "@/components/team/team-hero";
import { TeamMemberGrid } from "@/components/team/team-member-grid";
import { TeamOverview } from "@/components/team/team-overview";
import { WhyAgents } from "@/components/team/why-agents";
import { WorkingPrinciples } from "@/components/team/working-principles";

export const metadata: Metadata = {
  title: "Team — ClaimIt",
  description:
    "Meet the team building ClaimIt, an AI agent system for post-purchase price protection.",
};

export default function TeamPage() {
  return (
    <>
      <TeamHero />
      <TeamOverview />
      <TeamMemberGrid />
      <WhyAgents />
      <WorkingPrinciples />
      <CareersTeaser />
      <FinalCta />
    </>
  );
}
