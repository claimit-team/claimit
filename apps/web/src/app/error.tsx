"use client";

import { AlertCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary requires this exact function name
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ClaimIt] Error boundary caught:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <Card className="w-full max-w-[480px] border-neutral-200 bg-neutral-0 px-8 py-12 shadow-sm md:px-12">
        <CardContent className="flex flex-col items-center gap-6 p-0 text-center">
          <ShieldCheck
            className="size-6 text-brand-primary-500"
            strokeWidth={2.25}
            aria-hidden="true"
          />

          <AlertCircle className="size-24 text-neutral-400" strokeWidth={1.5} aria-hidden="true" />

          <h1 className="text-balance text-2xl font-semibold text-neutral-900">
            Something went wrong
          </h1>

          <p className="leading-relaxed text-neutral-700">
            We hit an unexpected error. Try again, and if it keeps happening, let us know.
          </p>

          <div className="mt-2 flex w-full flex-col items-center gap-4">
            <Button
              type="button"
              onClick={reset}
              className="w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 md:w-auto"
            >
              Try again
            </Button>

            <Link
              href="/help/contact"
              className="text-sm text-brand-primary-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2"
            >
              Contact support
            </Link>
          </div>

          {error.digest ? (
            <details className="mt-4 w-full">
              <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-700">
                Error reference
              </summary>
              <p className="mt-2 font-mono text-xs text-neutral-400">{error.digest}</p>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
