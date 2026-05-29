"use client";

import { AlertCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AuthApiError } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

const STAGE_COPY = [
  { untilMs: 1500, text: "Signing you in..." },
  { untilMs: 3000, text: "Verifying your account..." },
  { untilMs: 5000, text: "Setting up your workspace..." },
  { untilMs: 7000, text: "Loading your preferences..." },
  { untilMs: 10000, text: "Almost there..." },
  { untilMs: Number.POSITIVE_INFINITY, text: "Hang tight, just a moment longer..." },
] as const;

function getStageIndex(elapsedMs: number): number {
  return STAGE_COPY.findIndex((stage) => elapsedMs < stage.untilMs);
}

function friendlyOverlayMessage(code: string): string {
  switch (code) {
    case "request_timeout":
      return "This usually clears up on a quick retry.";
    case "token_timeout":
      return "We couldn't get your sign-in token in time. Try again in a moment.";
    case "unauthenticated":
      return "Looks like your session expired. Please sign in again.";
    case "permission_denied":
      return "We weren't able to verify your account. Try again or use a different account.";
    default:
      return "Something went wrong on our end. Please try again.";
  }
}

type PostOAuthOverlayProps = {
  state: "loading" | "error";
  error?: AuthApiError | null;
  onRetry?: () => void;
  onUseDifferentAccount?: () => void;
};

export function PostOAuthOverlay({
  state,
  error,
  onRetry,
  onUseDifferentAccount,
}: PostOAuthOverlayProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [displayStage, setDisplayStage] = useState(0);
  const [copyVisible, setCopyVisible] = useState(true);

  useEffect(() => {
    if (state !== "loading") {
      return;
    }

    setElapsedMs(0);
    setDisplayStage(0);
    setCopyVisible(true);

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [state]);

  const stageIndex = getStageIndex(elapsedMs);

  useEffect(() => {
    if (state !== "loading" || stageIndex === displayStage) {
      return;
    }

    setCopyVisible(false);
    const timeoutId = window.setTimeout(() => {
      setDisplayStage(stageIndex);
      setCopyVisible(true);
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [state, stageIndex, displayStage]);

  const stageText = STAGE_COPY[displayStage]?.text ?? STAGE_COPY[0].text;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-background/80 backdrop-blur-xl backdrop-saturate-150",
        "animate-in fade-in duration-200",
      )}
    >
      <div
        className={cn(
          "transition-opacity duration-200",
          state === "loading" ? "opacity-100" : "opacity-0 pointer-events-none absolute",
        )}
        aria-hidden={state !== "loading"}
      >
        <div className="flex flex-col items-center">
          <div className="relative flex size-20 items-center justify-center">
            <span
              className="absolute inset-0 rounded-full border border-foreground/20 animate-ring-pulse"
              aria-hidden="true"
            />
            <div
              className="relative flex size-20 items-center justify-center rounded-2xl bg-card shadow-lg animate-breathe"
              style={{ filter: "drop-shadow(0 8px 24px oklch(0.5 0.1 250 / 0.15))" }}
            >
              <ShieldCheck className="size-10 text-primary" strokeWidth={2.25} aria-hidden="true" />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            {[0, 200, 400].map((delay) => (
              <span
                key={delay}
                className="size-1.5 rounded-full bg-foreground/40 animate-pulse-dot"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>

          <p
            className={cn(
              "mt-4 text-sm text-muted-foreground transition-opacity duration-200",
              copyVisible ? "opacity-100" : "opacity-0",
            )}
          >
            {stageText}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "w-full max-w-[420px] px-4 transition-opacity duration-200",
          state === "error" ? "opacity-100" : "opacity-0 pointer-events-none absolute",
        )}
        aria-hidden={state !== "error"}
      >
        {state === "error" && error ? (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
            <AlertCircle className="size-8 text-amber-500" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-medium text-foreground">
              Sign-in didn&apos;t go through
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {friendlyOverlayMessage(error.code)}
            </p>
            <Button className="mt-6 w-full" size="lg" onClick={onRetry}>
              Try again
            </Button>
            <button
              type="button"
              onClick={onUseDifferentAccount}
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Use a different account
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
