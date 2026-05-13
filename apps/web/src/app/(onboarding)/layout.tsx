import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Onboarding — ClaimIt",
  description: "Complete your ClaimIt setup for purchase monitoring and claims.",
};

/**
 * Stripped onboarding shell: no marketing header/footer, no dashboard sidebar.
 * Centered column — max-width 480px; horizontal padding matches ~24px mobile margin.
 */
export default function OnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-dvh bg-neutral-50">
      <main className="flex min-h-dvh flex-col items-center px-6 py-8 md:py-12">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>
    </div>
  );
}
