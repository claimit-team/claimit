import { FileQuestion, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Mock auth — hardcoded until Identity Platform (5.2).
const isAuthenticated = true;
const primaryHref = isAuthenticated ? "/dashboard" : "/";
const primaryLabel = isAuthenticated ? "Back to dashboard" : "Back to home";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <Card className="w-full max-w-[480px] border-neutral-200 bg-neutral-0 shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-12 text-center md:px-12">
          <ShieldCheck
            className="size-6 text-brand-primary-500"
            strokeWidth={2.25}
            aria-hidden="true"
          />

          <FileQuestion className="size-24 text-neutral-400" strokeWidth={1.5} aria-hidden="true" />

          <h1 className="text-2xl font-semibold text-neutral-900">Page not found</h1>

          <p className="text-balance text-neutral-700">
            {"The page you're looking for doesn't exist or has been moved."}
          </p>

          <div className="mt-2 flex w-full flex-col items-center gap-4">
            <Link
              href={primaryHref}
              className={cn(
                buttonVariants(),
                "w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 md:w-auto",
              )}
            >
              {primaryLabel}
            </Link>

            <Link
              href="/help"
              className="rounded-sm text-sm text-brand-primary-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2"
            >
              Get help
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
