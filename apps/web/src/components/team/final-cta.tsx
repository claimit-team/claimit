"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section className="bg-neutral-0 py-16 sm:py-20 lg:py-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8"
      >
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          See ClaimIt in action.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-neutral-700">
          Walk through the agent workflow end to end.
        </p>
        <div className="mt-8">
          <Link
            href="/how-it-works"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
            )}
          >
            See how it works
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
