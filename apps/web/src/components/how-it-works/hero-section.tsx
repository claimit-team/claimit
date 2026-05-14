import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="flex min-h-[75vh] flex-col justify-center bg-neutral-0 sm:min-h-[85vh]">
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-tighter text-neutral-900 sm:text-6xl lg:text-7xl">
          How ClaimIt turns receipts into refund-ready claims.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-neutral-600 sm:text-xl">
          Connect Gmail or upload a receipt, let ClaimIt monitor supported policy windows, then
          review the claim material when an eligible drop is detected.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 inline-flex justify-center items-center px-8",
            )}
          >
            Try free
          </Link>
          <Link
            href="/pricing"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "text-neutral-700 hover:text-neutral-900",
            )}
          >
            View pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
