"use client";

import { AlertCircle, ClipboardCheck, Loader2, Settings2, Zap } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { StepIndicator } from "@/components/onboarding/step-indicator";
import { Button } from "@/components/ui/button";
import { AuthApiError, patchUserMe } from "@/lib/api/auth";
import { SettingsApiError, updateSendPreference } from "@/lib/api/settings";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";

type PreferenceValue = "approval" | "auto";

type PreferenceOption = {
  value: PreferenceValue;
  title: string;
  description: string;
  icon: typeof ClipboardCheck;
  pros: string[];
};

const OPTIONS: PreferenceOption[] = [
  {
    value: "approval",
    title: "Approve each claim",
    description: "I'll review every claim before ClaimIt sends it.",
    icon: ClipboardCheck,
    pros: ["Full control", "Review tone and timing", "Best for getting started"],
  },
  {
    value: "auto",
    title: "Send automatically",
    description: "ClaimIt sends eligible email claims for me with a 5-minute cancel window.",
    icon: Zap,
    pros: ["Faster for email claims", "Helps avoid short windows", "Cancel or review during delay"],
  },
];

type OptionCardProps = {
  option: PreferenceOption;
  isSelected: boolean;
  onSelect: () => void;
};

function OptionCard({ option, isSelected, onSelect }: OptionCardProps) {
  const Icon = option.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "w-full text-left transition-all",
        isSelected
          ? "rounded-xl border-2 border-brand-primary-500 bg-brand-primary-500/5 p-[15px] ring-4 ring-brand-primary-500/20"
          : "rounded-xl border border-neutral-200 bg-neutral-0 p-4 hover:border-neutral-300",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
              isSelected ? "bg-brand-primary-100" : "bg-neutral-100",
            )}
          >
            <Icon
              className={cn("size-5", isSelected ? "text-brand-primary-700" : "text-neutral-600")}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                "text-base tracking-tight",
                isSelected
                  ? "font-semibold text-brand-primary-700"
                  : "font-medium text-neutral-900",
              )}
            >
              {option.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">{option.description}</p>
          </div>
        </div>
        <div
          className={cn(
            "mt-1.5 size-4 shrink-0 rounded-full transition-all",
            isSelected
              ? "border-[5px] border-brand-primary-500 bg-neutral-0"
              : "border-2 border-neutral-300 bg-neutral-0",
          )}
          aria-hidden
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {option.pros.map((pro) => (
          <span
            key={pro}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              isSelected
                ? "bg-brand-primary-100 text-brand-primary-700"
                : "bg-neutral-100 text-neutral-700",
            )}
          >
            {pro}
          </span>
        ))}
      </div>

      {option.value === "auto" ? (
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Auto-send applies only to eligible email claims. Chat scripts, in-store guides, and
          self-service walkthroughs still require your action.
        </p>
      ) : null}
    </button>
  );
}

export default function OnboardingPreferencesPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [selectedPreference, setSelectedPreference] = useState<PreferenceValue>(
    (user?.send_preference?.default_mode as PreferenceValue | undefined) ?? "approval",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish() {
    if (!user) return;
    setIsSaving(true);
    setError(null);

    try {
      const userAfterPref = await updateSendPreference({
        default_mode: selectedPreference,
        auto_send_delay_seconds: user.send_preference?.auto_send_delay_seconds ?? 300,
      });
      setUser(userAfterPref);

      const userAfterOnboard = await patchUserMe({ onboarded: true });
      setUser(userAfterOnboard);

      toast.success("Welcome to ClaimIt!");
      router.replace("/dashboard");
    } catch (err) {
      const message =
        err instanceof SettingsApiError || err instanceof AuthApiError
          ? err.message
          : "Could not complete setup. Please try again.";
      setError(message);
      toast.error("Setup couldn't complete", { description: "Please try again." });
      setIsSaving(false);
    }
  }

  return (
    <>
      <StepIndicator currentStep={3} totalSteps={3} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8 lg:p-10"
      >
        <div className="space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
              <Settings2 className="size-5 text-neutral-700" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance text-neutral-900 sm:text-3xl">
              How should ClaimIt send claims?
            </h1>
            <p className="mt-3 text-base leading-relaxed text-neutral-600">
              You can change this anytime in settings.
            </p>
          </div>

          <div className="space-y-3">
            {OPTIONS.map((option) => (
              <OptionCard
                key={option.value}
                option={option}
                isSelected={selectedPreference === option.value}
                onSelect={() => setSelectedPreference(option.value)}
              />
            ))}
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-semantic-danger/20 bg-semantic-danger-bg p-3 text-sm text-semantic-danger">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <Button
              type="button"
              disabled={isSaving}
              size="lg"
              className="w-full bg-neutral-900 text-neutral-0 hover:bg-neutral-800"
              onClick={() => void handleFinish()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span className="ml-2">Saving…</span>
                </>
              ) : (
                "Continue to dashboard"
              )}
            </Button>

            <Link
              href="/onboarding/gmail"
              className="block text-center text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700"
            >
              Back
            </Link>
          </div>
        </div>
      </motion.div>
    </>
  );
}
