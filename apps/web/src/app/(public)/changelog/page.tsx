import type { Metadata } from "next";
import { ChangelogView } from "@/components/changelog/changelog-view";

export const metadata: Metadata = {
  title: "What's new | ClaimIt",
  description: "Recent updates to the ClaimIt platform.",
};

export default function ChangelogPage() {
  return <ChangelogView />;
}
