export type JobListing = {
  slug: string;
  title: string;
  status: string;
  area: string;
  location: string;
  employmentType: string;
  summary: string;
  aboutRole: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  relatedRoles: { title: string; slug: string }[];
};

export const ABOUT_CLAIMIT_BOILERPLATE =
  "ClaimIt is building practical agents for tedious consumer workflows — starting with post-purchase price drops. We're early, technically opinionated, and focused on shipping useful systems rather than benchmarks.";

export const jobsData: JobListing[] = [
  {
    slug: "frontend-engineer",
    title: "Frontend Engineer",
    status: "Future role",
    area: "Engineering",
    location: "Remote (US)",
    employmentType: "Full-time (future)",
    summary:
      "Build the surfaces where users review claims, watch agents work, and approve outcomes.",
    aboutRole:
      "You'll own the user-facing layer of ClaimIt — from the dashboard where people watch their purchases get monitored, to the claim review screens where agents present draft materials for approval, to the Assistant surface that lets users converse naturally with the system. Our frontend is React + Next.js, designed for clarity over visual complexity. You'll work directly with the agent layer (the agents propose; you make them feel inevitable).",
    responsibilities: [
      "Ship features end-to-end across public marketing pages and the authenticated app (dashboard, claim flows, Assistant)",
      "Translate agent outputs into clean, opinionated UI — handling streaming responses, partial states, and approval flows",
      "Build the design system as we go — we're committed to a restrained, premium aesthetic à la Linear / Stripe",
      "Own performance, accessibility, and the experience details that separate competent from world-class",
    ],
    requirements: [
      "3+ years of production React experience (Next.js App Router preferred)",
      "Strong TypeScript fluency; comfortable with strict configurations",
      "Real opinions about UI craftsmanship — typography, spacing, motion, restraint",
      "Familiarity with Tailwind, shadcn/ui, and modern frontend toolchains",
      "Comfort working in a small team where you own decisions end-to-end",
    ],
    niceToHave: [
      "Experience with streaming UI (LLM responses, SSE, server actions)",
      "Design fluency — can iterate on UI without a designer for early-stage work",
      "Past work on consumer products with high-trust UX (finance, healthcare, etc.)",
    ],
    relatedRoles: [
      { title: "Backend & Infrastructure Engineer", slug: "backend-infrastructure-engineer" },
      { title: "Agent Logic Engineer", slug: "agent-logic-engineer" },
    ],
  },
  {
    slug: "backend-infrastructure-engineer",
    title: "Backend & Infrastructure Engineer",
    status: "Future role",
    area: "Engineering",
    location: "Remote (US)",
    employmentType: "Full-time (future)",
    summary:
      "Own the cloud, the agent orchestration platform, and the systems that keep claims flowing reliably.",
    aboutRole:
      "You'll own ClaimIt's backend and cloud infrastructure end-to-end — from the FastAPI gateway that fronts our agents, to the Pub/Sub-based async orchestration, to the MongoDB data layer, to the Cloud Run deploys and IAM. We're built on GCP with a small, opinionated stack: we want fewer moving parts, not more. You'll set the patterns that the rest of the team follows.",
    responsibilities: [
      "Own the api-gateway service (FastAPI, Python) — design new endpoints, debug performance, evolve the data model",
      "Run the agent orchestration platform: Pub/Sub topics, Cloud Run workers, retries, observability",
      "Architect and operate the MongoDB layer (schemas, indexes, migrations, query patterns)",
      "Manage GCP infrastructure via Terraform (Cloud Run, IAM, Storage, Pub/Sub) — including disaster recovery and cost optimization",
      "Lead engineering hires on the backend side as we grow",
    ],
    requirements: [
      "4+ years of production backend engineering, ideally in Python (FastAPI or similar async frameworks)",
      "Real cloud infrastructure experience on GCP or AWS (Cloud Run / Lambda, IAM, storage, pub/sub-style messaging)",
      "Comfort with Terraform or equivalent IaC",
      "Strong opinions about reliability, observability, and graceful degradation",
      "Comfort owning an entire service stack — you debug what breaks, regardless of layer",
    ],
    niceToHave: [
      "Experience with LLM serving infrastructure (vLLM, streaming, multi-tenant inference)",
      "Background in regulated or high-trust domains (finance, healthcare)",
      "Past work as the first or second backend hire at a startup",
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
    area: "Engineering",
    location: "Remote (US)",
    employmentType: "Full-time (future)",
    summary:
      "Design the prompts, tools, and self-evaluation loops that make our agents reliably useful.",
    aboutRole:
      "ClaimIt runs on a 4-agent system that monitors purchases, drafts claim materials, and prepares them for user approval. The hard work isn't training models — it's prompt design, tool selection, output validation, and recovery from agent mistakes. You'll own that craft. We use Gemini (via Google's Agent Development Kit) with tool routing, output validators, and self-evaluation loops. You'll keep the agents honest, fast, and trustworthy.",
    responsibilities: [
      "Design and iterate on system prompts, tool descriptions, and few-shot patterns across our 4 sub-agents",
      "Build validators (structural + semantic) that catch agent mistakes before they reach users",
      "Implement self-evaluation loops where agents check their own outputs against ground truth",
      "Design tool interfaces — what tools to expose, when to call them, how to recover from failures",
      "Run evals end-to-end: build the dataset, score outputs, ship improvements with confidence",
    ],
    requirements: [
      "2+ years of practical LLM application work (not research; shipped systems serving real users)",
      "Strong intuition for prompt design and agent debugging — you've spent hours staring at trace logs",
      "Comfort with eval design: synthetic datasets, regression suites, scoring rubrics",
      "Strong Python fluency; able to ship infrastructure-adjacent code (FastAPI, async, MongoDB)",
      "A bias for measurement — 'feels better' doesn't count; show the eval delta",
    ],
    niceToHave: [
      "Experience with Google ADK or similar agent frameworks (LangChain, CrewAI, etc.)",
      "Background in structured generation (Pydantic models as output schemas, function calling)",
      "Past work on agents that take real actions in the world (not just chat)",
    ],
    relatedRoles: [
      { title: "Frontend Engineer", slug: "frontend-engineer" },
      { title: "Backend & Infrastructure Engineer", slug: "backend-infrastructure-engineer" },
    ],
  },
];

export function getJobBySlug(slug: string): JobListing | undefined {
  return jobsData.find((job) => job.slug === slug);
}

export function getAllJobSlugs(): string[] {
  return jobsData.map((job) => job.slug);
}
