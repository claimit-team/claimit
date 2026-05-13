"use client";

import { AlertCircle, CheckCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OnboardingLogo } from "@/components/onboarding/onboarding-logo";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type PreferenceValue = "approval" | "auto";

type PreferenceOption = {
  value: PreferenceValue;
  title: string;
  icon: typeof CheckCircle;
  subtext: string;
  pros: string[];
};

const options: PreferenceOption[] = [
  {
    value: "approval",
    title: "Approve each claim",
    icon: CheckCircle,
    subtext: "I'll review every claim before ClaimIt sends it.",
    pros: ["Full control", "Review tone and timing", "Best for getting started"],
  },
  {
    value: "auto",
    title: "Send automatically",
    icon: Send,
    subtext: "ClaimIt sends eligible email claims for me with a 5-minute cancel window.",
    pros: ["Faster for email claims", "Helps avoid short windows", "Cancel or review during delay"],
  },
];

export default function OnboardingPreferencesPage() {
  const router = useRouter();
  const [selectedPreference, setSelectedPreference] = useState<PreferenceValue>("approval");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setIsSaving(true);
    setError(null);

    await new Promise((resolve) => setTimeout(resolve, 400));

    setIsSaving(false);
    router.push("/onboarding/upload");
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator currentStep={3} />
      <OnboardingLogo />

      <Card className="w-full border-neutral-200 bg-neutral-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-center text-xl text-neutral-900">
            Choose how claims get sent
          </CardTitle>
          <CardDescription className="text-center text-neutral-700">
            ClaimIt can either ask before every claim is sent, or send eligible email claims
            automatically with a short cancel window. You can change this later in Settings.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <RadioGroup
            value={selectedPreference}
            onValueChange={(value) => setSelectedPreference(value as PreferenceValue)}
            className="space-y-3"
          >
            {options.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedPreference === option.value;

              return (
                <div key={option.value}>
                  <Label
                    htmlFor={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors",
                      isSelected
                        ? "border-brand-primary-500 bg-brand-primary-500/5"
                        : "border-neutral-200 bg-neutral-0 hover:border-neutral-400",
                    )}
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={option.value}
                      className={cn(
                        "mt-1 border-neutral-300 data-checked:border-brand-primary-500 data-checked:bg-brand-primary-500 [&_[data-slot=radio-group-indicator]_span]:bg-neutral-0",
                      )}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            "size-5 shrink-0",
                            isSelected ? "text-brand-primary-500" : "text-neutral-500",
                          )}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-neutral-900">{option.title}</span>
                      </div>
                      <p className="text-sm text-neutral-700">{option.subtext}</p>
                      <div className="flex flex-wrap gap-2">
                        {option.pros.map((pro) => (
                          <span
                            key={pro}
                            className="inline-flex items-center rounded-full bg-neutral-50 px-2.5 py-0.5 text-xs text-neutral-700"
                          >
                            {pro}
                          </span>
                        ))}
                      </div>

                      {option.value === "auto" ? (
                        <p className="mt-2 text-xs text-neutral-500">
                          Auto-send applies only to eligible email claims. Chat scripts, in-store
                          guides, and self-service walkthroughs still require your action.
                        </p>
                      ) : null}
                    </div>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>

          <p className="text-center text-xs text-neutral-500">
            You can change this anytime in Settings, or override per claim.
          </p>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-semantic-danger/20 bg-semantic-danger-bg p-3 text-sm text-semantic-danger">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex-col gap-3 border-t border-neutral-200 bg-neutral-50/80 pt-4">
          <Button
            type="button"
            disabled={isSaving}
            className="w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
            onClick={() => void handleContinue()}
          >
            {isSaving ? "Saving…" : "Continue"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="text-sm text-neutral-600 hover:text-neutral-900"
            onClick={() => router.push("/onboarding/gmail")}
          >
            Back
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
