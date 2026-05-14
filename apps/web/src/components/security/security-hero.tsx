import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SecurityHero() {
  return (
    <section className="flex min-h-[75vh] flex-col justify-center border-b border-border sm:min-h-[85vh]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Security and privacy by design.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            ClaimIt handles purchase-related data carefully, keeps users in control of claims, and
            limits access to what the workflow needs.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/login" className={cn(buttonVariants())}>
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
