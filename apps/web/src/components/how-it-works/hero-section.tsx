import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="flex min-h-[75vh] flex-col justify-center bg-neutral-0 sm:min-h-[85vh]">
      <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
          How ClaimIt turns receipts into refund-ready claims.
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-balance text-lg leading-relaxed text-neutral-600 sm:text-xl">
          Connect Gmail or upload a receipt. ClaimIt monitors policy windows and surfaces claim
          material when a drop qualifies.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 inline-flex justify-center items-center px-8 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
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
