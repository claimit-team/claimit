export interface JobListing {
  slug: string;
  title: string;
  status: string;
  area: string;
  summary: string;
  aboutTheWork: string[];
  responsibilities: string[];
  requirements: string[];
  relatedRoles: { title: string; slug: string }[];
}

export const jobsData: JobListing[] = [
  {
    slug: "frontend-engineer",
    title: "Frontend Engineer",
    status: "Future role",
    area: "Frontend",
    summary:
      "Help shape the dashboard, claim review workflow, and Assistant surfaces for a practical agent product.",
    aboutTheWork: [
      "Build Next.js App Router pages that power the core ClaimIt experience.",
      "Implement dashboard views, claim review UI, and file upload flows using Tailwind CSS and shadcn/ui.",
      "Work with shared TypeScript schemas and mock data as APIs are finalized.",
      "Maintain a calm, credible visual language appropriate for financial SaaS.",
    ],
    responsibilities: [
      "Design and implement product surfaces with Next.js, Tailwind CSS, and shadcn/ui.",
      "Build UI around real workflow states such as pending confirmation, review needed, submitted, and outcome update needed.",
      "Collaborate on shared interfaces rather than inventing page-specific data shapes.",
      "Keep the UI restrained, accessible, and trustworthy.",
    ],
    requirements: [
      "Comfort working from product specs.",
      "Strong frontend engineering fundamentals.",
      "Interest in agent products and workflow reliability.",
      "Careful judgment around financial UI and user trust.",
      "Ability to work with mock data before APIs are complete.",
    ],
    relatedRoles: [
      { title: "Backend / Infrastructure Engineer", slug: "backend-infrastructure-engineer" },
      { title: "Agent Logic Engineer", slug: "agent-logic-engineer" },
    ],
  },
  {
    slug: "backend-infrastructure-engineer",
    title: "Backend / Infrastructure Engineer",
    status: "Future role",
    area: "Backend",
    summary:
      "Build reliable infrastructure for agent services, data pipelines, and deployment workflows.",
    aboutTheWork: [
      "Work with Cloud Run, Pub/Sub, MongoDB, and deployment workflows.",
      "Support agent service reliability and observability across the ClaimIt system.",
      "Build API contracts and data pipelines that frontend and agent logic depend on.",
      "Keep infrastructure costs reasonable while maintaining quality and uptime.",
    ],
    responsibilities: [
      "Design and maintain cloud infrastructure using GCP services.",
      "Build robust API endpoints with proper error handling and validation.",
      "Implement observability, logging, and alerting for production services.",
      "Collaborate with frontend and agent teams on data contracts.",
    ],
    requirements: [
      "Experience with cloud infrastructure (GCP preferred).",
      "Strong judgment about reliability vs. complexity tradeoffs.",
      "Interest in agent workflows and financial data handling.",
      "Care for security and data privacy.",
    ],
    relatedRoles: [
      { title: "Frontend Engineer", slug: "frontend-engineer" },
      { title: "Agent Logic Engineer", slug: "agent-logic-engineer" },
    ],
  },
  {
    slug: "agent-logic-engineer",
    title: "Agent Logic Engineer",
    status: "Future role",
    area: "Agent Logic",
    summary:
      "Build Gemini prompt flows, tool routing, validators, and self-evaluation for ClaimIt agents.",
    aboutTheWork: [
      "Build Gemini prompt flows, tool routing, validators, and self-evaluation logic.",
      "Work on Ingest, Monitor, Claim, and Assistant agent behavior.",
      "Keep financial output grounded in database fields, not model guesses.",
      "Balance automation with user approval requirements.",
    ],
    responsibilities: [
      "Design and implement agent prompt chains and tool routing.",
      "Build validators to ensure agent outputs meet financial accuracy requirements.",
      "Implement self-evaluation and error recovery for agent workflows.",
      "Collaborate on agent behavior specifications with product and design.",
    ],
    requirements: [
      "Experience with LLM prompting and agent architectures.",
      "Strong judgment about what not to automate.",
      "Interest in financial workflows and user trust.",
      "Care for explainable, verifiable agent decisions.",
    ],
    relatedRoles: [
      { title: "Frontend Engineer", slug: "frontend-engineer" },
      { title: "Backend / Infrastructure Engineer", slug: "backend-infrastructure-engineer" },
    ],
  },
];

export function getJobBySlug(slug: string): JobListing | undefined {
  return jobsData.find((job) => job.slug === slug);
}

export function getAllJobSlugs(): string[] {
  return jobsData.map((job) => job.slug);
}
