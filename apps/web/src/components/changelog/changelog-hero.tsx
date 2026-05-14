import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChangelogHero() {
  return (
    <section className="mb-12 flex min-h-[40vh] flex-col justify-center sm:min-h-[50vh]">
      <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl">
        Changelog
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-neutral-600 sm:text-xl">
        Product updates, interface changes, and implementation notes as ClaimIt moves from MVP to
        working demo.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link
          href="/how-it-works"
          className={cn(
            buttonVariants(),
            "inline-flex items-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
          )}
        >
          See how it works
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
        <Link
          href="/blog"
          className="text-sm font-medium text-brand-primary-500 transition-colors hover:text-brand-primary-600"
        >
          Read the blog
        </Link>
      </div>
    </section>
  );
}
