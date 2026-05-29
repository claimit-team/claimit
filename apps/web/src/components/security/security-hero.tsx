import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SecurityHero() {
  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h1 className="text-balance text-4xl font-semibold leading-[0.95] tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
            Security and privacy by design.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            ClaimIt handles purchase-related data carefully, keeps users in control of claims, and
            limits access to what the workflow needs.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className={cn(
                buttonVariants(),
                "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
              )}
            >
              Try free
            </Link>
            <Link
              href="/privacy"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Read privacy policy
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
