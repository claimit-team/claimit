import { OnboardingLogo } from "@/components/onboarding/onboarding-logo";
import { OnboardingUploadStep } from "@/components/onboarding/onboarding-upload-step";
import { StepIndicator } from "@/components/onboarding/step-indicator";

export default function OnboardingUploadPage() {
  return (
    <div className="flex flex-col gap-6">
      <StepIndicator currentStep={4} />
      <OnboardingLogo />
      <OnboardingUploadStep />
    </div>
  );
}
