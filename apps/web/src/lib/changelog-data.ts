export type Release = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

export const RELEASES: Release[] = [
  {
    version: "v0.3",
    date: "May 29, 2026",
    title: "Assistant, auto-send, and a world-class public site",
    highlights: [
      "Assistant Modes A and B are live across every authenticated page, with a floating panel and full conversation history backed by SSE streaming",
      "Auto-send mode shipped: set your default at onboarding, override per claim, with a five-minute cancellable queue before any send",
      "Output validator and Gemini self-critique pass on every draft — placeholders, ID matches, and prohibited language all checked before review",
      "Marketing site relaunch: pricing, security, how-it-works, help, team, and careers — all in light and dark mode",
      "Careers interest form now persists to a private database with resume upload to dedicated cloud storage",
    ],
  },
  {
    version: "v0.2",
    date: "May 23, 2026",
    title: "Four-agent pipeline and Gmail integration",
    highlights: [
      "Four sub-agents orchestrated by Google Cloud Agent Builder: Ingest, Monitor, Claim, and Assistant — coordinated through Pub/Sub events",
      "Gmail integration end to end: connect once at onboarding for automatic purchase detection, with seven-day watch renewal and outbound Send via your own inbox",
      "Cadence-based price monitoring tightens from six hours to fifteen minutes as claim windows approach",
      "Member-tier-aware eligibility validation against 26 documented retail, airline, and hotel policies",
      "Four claim output formats: email drafts, chat scripts, in-store guides, and self-service walkthroughs — routed automatically per platform",
      "Three-pane approval UI: editable draft, evidence screenshot, inline Assistant chat",
      "Best Buy live end to end: receipt ingest, price monitoring, claim drafting, approval, and Gmail send all working in production",
    ],
  },
  {
    version: "v0.1",
    date: "May 15, 2026",
    title: "Foundation",
    highlights: [
      "Cloud-native architecture: Google Cloud Run, Pub/Sub, Cloud Scheduler, Secret Manager, MongoDB Atlas, Vercel",
      "Schema lock across six MongoDB collections with shared TypeScript and Python type definitions",
      "Full Arize Phoenix observability from the first Gemini call",
      "Receipt ingest pipeline live end to end: upload → Gemini Vision extraction → MongoDB → dashboard render",
    ],
  },
];

export const COMING_SOON: readonly string[] = [
  "Live integrations extending to Southwest, Hilton, and beyond",
  "Phoenix trace links surfacing inline in the Assistant pane",
  "Backend persistence for the Help and Contact form",
];
