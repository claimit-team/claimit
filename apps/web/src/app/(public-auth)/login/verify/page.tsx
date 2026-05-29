"use client";

import { FirebaseError } from "firebase/app";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeMagicLinkSignIn,
  getStashedMagicLinkEmail,
  isMagicLinkUrl,
} from "@/lib/auth-actions";
import { useAuthStore } from "@/store";

type Status = "loading" | "needs-email" | "completing" | "error";

export default function MagicLinkVerifyPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  useEffect(() => {
    if (user) {
      router.replace(user.onboarded ? "/dashboard" : "/onboarding");
    }
  }, [user, router]);

  const completeFlow = useCallback(async (email: string) => {
    setStatus("completing");
    setError(null);
    try {
      await completeMagicLinkSignIn(email, window.location.href);
    } catch (e) {
      if (e instanceof FirebaseError) {
        setError(friendlyVerifyError(e.code));
      } else {
        setError("Couldn't complete sign-in. Please request a new link.");
      }
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMagicLinkUrl(window.location.href)) {
      setStatus("error");
      setError("This link isn't a valid sign-in link. It may have expired or already been used.");
      return;
    }
    const stashedEmail = getStashedMagicLinkEmail();
    if (stashedEmail) {
      void completeFlow(stashedEmail);
    } else {
      setStatus("needs-email");
    }
  }, [completeFlow]);

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    void completeFlow(emailInput.trim());
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8"
        >
          {status === "loading" || status === "completing" ? (
            <div className="flex flex-col items-center text-center">
              <Loader2 className="size-8 animate-spin text-neutral-400" aria-hidden />
              <p className="mt-4 text-sm leading-relaxed text-neutral-600">
                {status === "loading" ? "Verifying your sign-in link..." : "Signing you in..."}
              </p>
            </div>
          ) : status === "needs-email" ? (
            <>
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                  Confirm your email
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  To finish signing in, please enter the email address you used to request the link.
                </p>
              </div>
              <form onSubmit={handleEmailSubmit} className="mt-6 space-y-3" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="verify-email" className="sr-only">
                    Email address
                  </Label>
                  <Input
                    id="verify-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={emailInput.trim().length === 0}
                >
                  Continue
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-red-50">
                <AlertCircle className="size-6 text-red-600" aria-hidden />
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
                Sign-in failed
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{error}</p>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center text-sm font-medium text-brand-primary-500 transition-colors hover:text-brand-primary-600"
              >
                <ArrowLeft className="mr-1.5 size-4" aria-hidden />
                Back to sign in
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}

function friendlyVerifyError(code: string): string {
  switch (code) {
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "This link has expired or already been used. Please request a new sign-in link.";
    case "auth/invalid-email":
      return "The email address doesn't match the one this link was sent to.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection and try again.";
    default:
      return "Something went wrong. Please request a new sign-in link.";
  }
}
