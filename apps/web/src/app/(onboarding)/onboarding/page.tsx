import { OnboardingLogo } from "@/components/onboarding/onboarding-logo";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { WelcomeCard } from "@/components/onboarding/welcome-card";

export default function OnboardingWelcomePage() {
  return (
    <div className="flex flex-col gap-6">
      <StepIndicator currentStep={1} />
      <OnboardingLogo />
      <WelcomeCard />
    </div>
  );
}
