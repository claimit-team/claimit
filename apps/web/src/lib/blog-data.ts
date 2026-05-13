export type BlogPost = {
  category: "Product" | "Engineering" | "Security" | "Company";
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
};

export const featuredPost: BlogPost = {
  category: "Product",
  title: "Why ClaimIt focuses on claim materials, not coupons",
  excerpt:
    "Post-purchase price protection is not about chasing deals. It is about helping users follow through on policies that already exist.",
  date: "May 2026",
  readTime: "4 min read",
};

export const blogPosts: BlogPost[] = [
  {
    category: "Product",
    title: "The difference between alerts and follow-through",
    excerpt: "Why ClaimIt goes beyond notifying users and helps prepare the next step.",
    date: "May 2026",
    readTime: "3 min read",
  },
  {
    category: "Engineering",
    title: "Designing an agent workflow around user approval",
    excerpt: "How approval-gated defaults shape the claim review experience.",
    date: "May 2026",
    readTime: "5 min read",
  },
  {
    category: "Security",
    title: "How Gmail access fits into ClaimIt's workflow",
    excerpt: "A practical look at order confirmations, claim sending, and user control.",
    date: "April 2026",
    readTime: "4 min read",
  },
  {
    category: "Product",
    title: "Why claim outcomes are user-reported",
    excerpt: "Many claims resolve outside the app, so users remain the source of truth.",
    date: "April 2026",
    readTime: "3 min read",
  },
  {
    category: "Engineering",
    title: "Four claim material types, one review surface",
    excerpt:
      "Email drafts, chat scripts, in-store guides, and self-service walkthroughs need different UI states.",
    date: "April 2026",
    readTime: "6 min read",
  },
  {
    category: "Company",
    title: "Building ClaimIt for the Google Cloud Rapid Agent Hackathon",
    excerpt: "A short note on scope, constraints, and product direction.",
    date: "April 2026",
    readTime: "2 min read",
  },
];

export const categories = ["All", "Product", "Engineering", "Security", "Company"] as const;
export type Category = (typeof categories)[number];
