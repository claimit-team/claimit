import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PublicHeader } from "@/components/layout/public-header";

export const metadata: Metadata = {
  title: "Sign in — ClaimIt",
  description:
    "Continue to ClaimIt for purchase monitoring and claim workflows. MVP mock sign-in only.",
};

/**
 * Routes like /login share marketing navigation but omit the marketing footer so
 * auth shells stay vertically focused — matching the authenticated route-group split.
 */
export default function PublicAuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-0">
      <PublicHeader />
      {children}
    </div>
  );
}
