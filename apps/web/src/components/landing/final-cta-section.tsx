"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCtaSection() {
  return (
    <section className="border-t border-neutral-200 px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-balance text-2xl font-semibold text-neutral-900 sm:text-3xl">
          Start with one receipt
        </h2>
        <p className="mt-4 text-pretty text-neutral-700">
          Upload a purchase or connect Gmail, then let ClaimIt watch the price windows.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "lg" }),
              "gap-2 w-full sm:w-auto inline-flex justify-center bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 px-10 ring-1 ring-brand-accent-500/0 hover:ring-brand-accent-500/40 transition-all",
            )}
          >
            Try Free
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
