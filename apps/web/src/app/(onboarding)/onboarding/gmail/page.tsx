"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { OnboardingLogo } from "@/components/onboarding/onboarding-logo";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const reassurancePoints = [
  "ClaimIt requests read-only Gmail access scoped to what we need to surface order-related messages from supported merchants.",
  "We aim to retain purchase-related details used for monitoring and claims—not your full inbox for unrelated browsing or resale.",
  "You can disconnect Gmail in Settings; disconnect stops further synced access going forward.",
  "When ClaimIt sends email claims on your behalf, copies typically appear in your Sent folder for your records.",
];

export default function OnboardingGmailPage() {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleContinueGoogle() {
    setIsConnecting(true);
    toast.loading("Connecting…", { id: "gmail-connect" });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast.success("Connected (mock). Wire OAuth in Identity Platform.", { id: "gmail-connect" });
    setIsConnecting(false);
    router.push("/onboarding/preferences");
  }

  function handleSkip() {
    router.push("/onboarding/preferences");
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator currentStep={2} />
      <OnboardingLogo />

      <Card className="w-full border-neutral-200 bg-neutral-0 shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-neutral-900">Connect your Gmail</CardTitle>
          <CardDescription className="text-neutral-700">
            ClaimIt can use Gmail to find order confirmations from supported platforms and start
            monitoring eligible purchases. You can skip this step and upload receipts manually
            later.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <ul className="space-y-3">
            {reassurancePoints.map((point) => (
              <li key={point} className="flex gap-3">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-neutral-500"
                  aria-hidden="true"
                />
                <span className="text-sm text-neutral-700">{point}</span>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            size="lg"
            disabled={isConnecting}
            className="w-full gap-2 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 disabled:opacity-80"
            onClick={() => void handleContinueGoogle()}
          >
            {isConnecting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Connecting…
              </>
            ) : (
              <>
                <Mail className="size-4" aria-hidden="true" />
                Continue with Google
              </>
            )}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-neutral-500 underline-offset-4 transition-colors hover:text-neutral-800 hover:underline"
            >
              {"I'll do this later"}
            </button>
          </div>

          <div className="text-center">
            <Link
              href="/security"
              className="text-sm text-brand-primary-600 underline-offset-4 hover:underline"
            >
              Read our security commitments
            </Link>
          </div>

          <p className="text-center text-xs text-neutral-500">
            You can upload PDF, PNG, or JPG receipts manually from your dashboard anytime.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
