"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type StepIndicatorProps = {
  currentStep: number;
  totalSteps?: number;
};

export function StepIndicator({ currentStep, totalSteps = 3 }: StepIndicatorProps) {
  const progressPercent = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Progress
        value={progressPercent}
        className={cn(
          "w-full [&_[data-slot=progress-track]]:bg-neutral-200 [&_[data-slot=progress-indicator]]:bg-brand-primary-500",
        )}
      />
      <p className="text-xs text-neutral-500">
        Step {currentStep} of {totalSteps}
      </p>
    </div>
  );
}
