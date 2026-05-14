import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TeamHero() {
  return (
    <section className="flex min-h-[75vh] flex-col justify-center bg-neutral-50 sm:min-h-[85vh]">
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-tighter text-neutral-900 sm:text-6xl lg:text-7xl">
          The team building ClaimIt.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-600 sm:text-xl">
          We are building a practical agent system for a tedious consumer workflow: finding eligible
          post-purchase price drops and preparing the right claim material.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/login" className={cn(buttonVariants())}>
            Try free
          </Link>
          <Link
            href="/how-it-works"
            className="text-sm font-medium text-brand-primary-500 transition-colors hover:text-brand-primary-600"
          >
            See how it works
          </Link>
        </div>
      </div>
    </section>
  );
}
