import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          See ClaimIt in action.
        </h2>
        <Link href="/how-it-works" className={cn(buttonVariants(), "mt-6 inline-flex")}>
          See how it works
        </Link>
      </div>
    </section>
  );
}
