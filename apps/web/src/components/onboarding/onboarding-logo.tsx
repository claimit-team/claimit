import { ShieldCheck } from "lucide-react";

export function OnboardingLogo() {
  return (
    <div className="flex justify-center">
      <ShieldCheck
        className="size-8 text-brand-primary-500"
        strokeWidth={2.25}
        aria-hidden="true"
      />
    </div>
  );
}
