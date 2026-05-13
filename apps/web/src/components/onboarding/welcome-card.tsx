import Link from "next/link";
import { FlowPreview } from "@/components/onboarding/flow-preview";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function WelcomeCard() {
  return (
    <Card className="w-full border-neutral-200 bg-neutral-0 shadow-sm">
      <CardContent className="flex flex-col gap-6">
        <div className="space-y-3 text-center">
          <h1 className="font-heading text-xl font-semibold text-neutral-900">
            Welcome to ClaimIt
          </h1>
          <p className="text-sm leading-relaxed text-neutral-700">
            ClaimIt helps you monitor purchases after checkout and prepare refund claim materials
            when a supported platform&apos;s price protection policy applies. You stay in control of
            what gets reviewed, sent, or marked resolved. The goal is a clearer reclaim workflow
            without chasing policies by hand.
          </p>
        </div>

        <FlowPreview />

        <div className="flex flex-col gap-3">
          <Link
            href="/onboarding/gmail"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
            )}
          >
            Get started
          </Link>

          <p className="text-center text-xs text-neutral-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-brand-primary-600 underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
