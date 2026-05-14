import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCTA() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
          Try ClaimIt with one receipt.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-neutral-700">
          You can start with upload first, then connect Gmail when you are ready.
        </p>
        <div className="mt-8 inline-flex justify-center">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 px-12",
            )}
          >
            Try free
          </Link>
        </div>
      </div>
    </section>
  );
}
