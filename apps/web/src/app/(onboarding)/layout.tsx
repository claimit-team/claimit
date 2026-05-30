import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OnboardingGate } from "./onboarding-gate";

export const metadata: Metadata = {
  title: "Onboarding — ClaimIt",
  description: "Complete your ClaimIt setup for purchase monitoring and claims.",
};

/**
 * Stripped onboarding shell: no marketing header/footer, no dashboard sidebar.
 * Centered column — max-width 560px.
 *
 * `OnboardingGate` is a client component that handles auth + completion
 * redirects (no user → /login, already onboarded → /dashboard); keeping it
 * separate lets this layout stay a server component for `metadata` export.
 */
export default function OnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <OnboardingGate>
      <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-4 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-[560px] space-y-6">{children}</div>
      </main>
    </OnboardingGate>
  );
}
