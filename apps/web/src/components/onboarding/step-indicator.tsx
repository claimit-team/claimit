type StepIndicatorProps = {
  currentStep: number;
  totalSteps: number;
};

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  const percent = (currentStep / totalSteps) * 100;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-neutral-500">
        Step {currentStep} of {totalSteps}
      </p>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100"
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
      >
        <div
          className="h-full rounded-full bg-brand-primary-500 transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
