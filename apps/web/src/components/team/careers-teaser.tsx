import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CareersTeaser() {
  return (
    <section className="bg-neutral-0 py-16 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Interested in what we are building?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-neutral-700">
          We are not hiring broadly yet, but you can drop your resume for future roles.
        </p>
        <div className="mt-8">
          <Link
            href="/careers"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
            )}
          >
            View careers
          </Link>
        </div>
      </div>
    </section>
  );
}
