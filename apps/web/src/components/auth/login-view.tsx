"use client";

import { FirebaseError } from "firebase/app";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { GithubMark } from "@/components/auth/github-mark";
import { GoogleMark } from "@/components/auth/google-mark";
import { PostOAuthOverlay } from "@/components/auth/post-oauth-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthApiError } from "@/lib/api/auth";
import { sendMagicLink, signInWithGithub, signInWithGoogle, signOutUser } from "@/lib/auth-actions";
import { useAuthStore } from "@/store";

type PostOAuthState = "idle" | "awaiting" | "error";
type MagicLinkState = "idle" | "sending" | "sent";
type SocialProvider = "google" | "github";

export function LoginView() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signInError = useAuthStore((s) => s.signInError);
  const setSignInError = useAuthStore((s) => s.setSignInError);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [postOAuthState, setPostOAuthState] = useState<PostOAuthState>("idle");
  const [lastProvider, setLastProvider] = useState<SocialProvider | null>(null);

  const [magicLinkState, setMagicLinkState] = useState<MagicLinkState>("idle");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  // ── C1 PRESERVE: F2/F3 redirect ─────────────────────────────
  useEffect(() => {
    if (user) {
      router.replace(user.onboarded ? "/dashboard" : "/onboarding");
    }
  }, [user, router]);

  useEffect(() => {
    if (signInError && postOAuthState === "awaiting") {
      setPostOAuthState("error");
    }
  }, [signInError, postOAuthState]);

  const handlePopupError = useCallback(
    (error: unknown) => {
      if (error instanceof FirebaseError) {
        if (
          error.code === "auth/popup-closed-by-user" ||
          error.code === "auth/cancelled-popup-request"
        ) {
          setPostOAuthState("idle");
          return;
        }
        setSignInError(new AuthApiError(error.code, error.message));
      } else {
        setSignInError(new AuthApiError("unknown", "Sign-in failed. Please try again."));
      }
      setPostOAuthState("error");
    },
    [setSignInError],
  );

  const startSocialSignIn = useCallback(
    async (provider: SocialProvider) => {
      setSignInError(null);
      setLastProvider(provider);
      setPostOAuthState("awaiting");
      try {
        if (provider === "google") await signInWithGoogle();
        else await signInWithGithub();
      } catch (error) {
        handlePopupError(error);
      }
    },
    [setSignInError, handlePopupError],
  );

  const handleGoogleSignIn = useCallback(() => startSocialSignIn("google"), [startSocialSignIn]);

  const handleGithubSignIn = useCallback(() => startSocialSignIn("github"), [startSocialSignIn]);

  const handleRetry = useCallback(async () => {
    if (!lastProvider) {
      setPostOAuthState("idle");
      return;
    }
    await startSocialSignIn(lastProvider);
  }, [lastProvider, startSocialSignIn]);

  const handleUseDifferentAccount = useCallback(async () => {
    await signOutUser();
    setSignInError(null);
    setPostOAuthState("idle");
    setLastProvider(null);
  }, [setSignInError]);

  const handleMagicLinkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMagicLinkError(null);
    setMagicLinkState("sending");
    try {
      await sendMagicLink(magicLinkEmail.trim());
      setMagicLinkState("sent");
    } catch (error) {
      if (error instanceof FirebaseError) {
        setMagicLinkError(friendlyMagicLinkError(error.code));
      } else {
        setMagicLinkError("We couldn't send the link. Please try again.");
      }
      setMagicLinkState("idle");
    }
  };

  const handleUseDifferentEmail = () => {
    setMagicLinkState("idle");
    setMagicLinkEmail("");
    setMagicLinkError(null);
  };

  const socialDisabled = isLoading || postOAuthState === "awaiting" || magicLinkState === "sending";

  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-[420px]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="rounded-2xl bg-neutral-0 p-6 ring-1 ring-neutral-200 sm:p-8"
          >
            {magicLinkState === "sent" ? (
              <MagicLinkSentCard email={magicLinkEmail} onReset={handleUseDifferentEmail} />
            ) : (
              <>
                <div className="flex flex-col items-center text-center">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
                    <ShieldCheck className="size-5 text-neutral-700" aria-hidden />
                  </div>
                  <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
                    Sign in to ClaimIt
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    Continue to monitor purchases, review claims, and manage your preferences.
                  </p>
                </div>

                <div className="mt-6 space-y-3">
                  <Button
                    onClick={() => void handleGoogleSignIn()}
                    disabled={socialDisabled}
                    size="lg"
                    className="w-full gap-2 bg-neutral-900 text-neutral-0 hover:bg-neutral-800"
                  >
                    <GoogleMark className="size-5" />
                    Continue with Google
                  </Button>
                  <Button
                    onClick={() => void handleGithubSignIn()}
                    disabled={socialDisabled}
                    size="lg"
                    className="w-full gap-2 bg-neutral-900 text-neutral-0 hover:bg-neutral-800"
                  >
                    <GithubMark className="size-5" aria-hidden />
                    Continue with GitHub
                  </Button>
                </div>

                <div className="mt-6 flex items-center gap-3" aria-hidden>
                  <div className="h-px flex-1 bg-neutral-200" />
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    or
                  </span>
                  <div className="h-px flex-1 bg-neutral-200" />
                </div>

                <form
                  onSubmit={(e) => void handleMagicLinkSubmit(e)}
                  className="mt-6 space-y-3"
                  noValidate
                >
                  <div className="space-y-2">
                    <Label htmlFor="magic-link-email" className="sr-only">
                      Email address
                    </Label>
                    <Input
                      id="magic-link-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      value={magicLinkEmail}
                      onChange={(e) => setMagicLinkEmail(e.target.value)}
                      disabled={magicLinkState === "sending"}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    variant="outline"
                    className="w-full"
                    disabled={magicLinkState === "sending" || magicLinkEmail.trim().length === 0}
                  >
                    {magicLinkState === "sending" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Sending link...
                      </>
                    ) : (
                      "Continue with email"
                    )}
                  </Button>
                  {magicLinkError ? (
                    <p role="alert" className="text-sm leading-relaxed text-red-600">
                      {magicLinkError}
                    </p>
                  ) : null}
                </form>

                <p className="mt-6 text-center text-xs leading-relaxed text-neutral-500">
                  By continuing, you agree to our{" "}
                  <Link
                    href="/terms"
                    className="text-brand-primary-500 underline-offset-4 hover:underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="text-brand-primary-500 underline-offset-4 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </>
            )}
          </motion.div>
        </div>
      </main>

      {postOAuthState !== "idle" ? (
        <PostOAuthOverlay
          state={postOAuthState === "error" ? "error" : "loading"}
          error={signInError}
          onRetry={() => void handleRetry()}
          onUseDifferentAccount={() => void handleUseDifferentAccount()}
        />
      ) : null}
    </>
  );
}

function MagicLinkSentCard({ email, onReset }: { email: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-accent-50">
        <CheckCircle2 className="size-6 text-brand-accent-600" aria-hidden />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
        Check your email
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        We sent a sign-in link to <strong className="font-medium text-neutral-900">{email}</strong>.
        Open it on this device to finish signing in.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex items-center text-sm font-medium text-brand-primary-500 transition-colors hover:text-brand-primary-600"
      >
        <ArrowLeft className="mr-1.5 size-4" aria-hidden />
        Use a different email
      </button>
    </div>
  );
}

function friendlyMagicLinkError(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look valid. Please check and try again.";
    case "auth/missing-email":
      return "Please enter your email address.";
    case "auth/quota-exceeded":
      return "We've sent too many links recently. Please try again in a few minutes.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email sign-in isn't available right now. Please try Google or GitHub.";
    default:
      return "We couldn't send the link. Please try again.";
  }
}
