import type { Metadata } from "next";
import { BlogView } from "@/components/blog/blog-view";

export const metadata: Metadata = {
  title: "Blog — ClaimIt",
  description:
    "Notes on price protection workflows, agents, engineering, security, and product direction.",
};

export default function BlogPage() {
  return <BlogView />;
}
