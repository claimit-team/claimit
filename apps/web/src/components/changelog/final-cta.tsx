import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCTA() {
  return (
    <section className="text-center">
      <h2 className="text-lg font-semibold text-neutral-900">Want to try the current flow?</h2>
      <div className="mt-4">
        <Link href="/login" className={cn(buttonVariants())}>
          Try free
        </Link>
      </div>
    </section>
  );
}
