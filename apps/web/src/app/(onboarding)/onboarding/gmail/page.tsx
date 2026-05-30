"use client";

import { Check, Loader2, Mail } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { GoogleMark } from "@/components/auth/google-mark";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { Button } from "@/components/ui/button";
import { CALLBACK_ERROR_MESSAGES, connectGmail, GmailApiError } from "@/lib/api/gmail";

export default function OnboardingGmailPage() {
  const router = useRouter();
  const callbackHandledRef = useRef(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // /api/v1/gmail/callback 302s back here with ?status=connected|error after the
  // OAuth round trip. On success, surface a toast and advance to the next step;
  // on error, show the user-friendly reason. ref-guard avoids double-firing
  // under React StrictMode. We read window.location.search directly instead of
  // useSearchParams() to avoid the App Router static-prerender Suspense bailout.
  useEffect(() => {
    if (callbackHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "connected") {
      callbackHandledRef.current = true;
      toast.success("Gmail connected successfully.", { id: "gmail-connect" });
      router.replace("/onboarding/preferences");
    } else if (status === "error") {
      callbackHandledRef.current = true;
      const reason = params.get("reason") ?? "internal_error";
      toast.error(CALLBACK_ERROR_MESSAGES[reason] ?? CALLBACK_ERROR_MESSAGES.internal_error, {
        id: "gmail-connect",
      });
      router.replace("/onboarding/gmail");
    }
  }, [router]);

  async function handleContinueGoogle() {
    setIsConnecting(true);
    toast.loading("Connecting…", { id: "gmail-connect" });
    try {
      const { authorization_url } = await connectGmail("/onboarding/gmail");
      window.location.href = authorization_url;
    } catch (err) {
      setIsConnecting(false);
      const message =
        err instanceof GmailApiError
          ? err.message
          : "Could not start Gmail connection. Please try again.";
      toast.error(message, { id: "gmail-connect" });
    }
  }

  return (
    <>
      <StepIndicator currentStep={2} totalSteps={3} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8 lg:p-10"
      >
        <div className="space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
              <Mail className="size-5 text-neutral-700" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance text-neutral-900 sm:text-3xl">
              Connect your Gmail
            </h1>
            <p className="mt-3 text-base leading-relaxed text-neutral-600">
              We read order confirmations to find purchases worth monitoring. We never read anything
              else.
            </p>
          </div>

          <div className="space-y-3 rounded-xl bg-neutral-50 p-4">
            <p className="text-sm font-medium text-neutral-900">What we&apos;ll access</p>
            <ul className="space-y-2 text-sm text-neutral-700">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden />
                Order confirmation emails only
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden />
                Send claim emails on your behalf, with your approval
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden />
                You can disconnect anytime from settings
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              onClick={() => void handleContinueGoogle()}
              disabled={isConnecting}
              size="lg"
              className="w-full bg-neutral-900 text-neutral-0 hover:bg-neutral-800"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span className="ml-2">Opening Google…</span>
                </>
              ) : (
                <>
                  <GoogleMark className="size-5" />
                  <span className="ml-2">Connect Gmail</span>
                </>
              )}
            </Button>
            <Link
              href="/onboarding/preferences"
              className="block text-center text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700"
            >
              Skip for now
            </Link>
          </div>
        </div>
      </motion.div>
    </>
  );
}
