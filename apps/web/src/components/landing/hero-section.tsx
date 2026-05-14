"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface HeroSectionProps {
  isLoading?: boolean;
}

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: "easeOut" as const },
});

export function HeroSection({ isLoading = false }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 800px 600px at 90% 10%, hsl(217 50% 30% / 0.08), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-5 lg:gap-16">
          <div className="text-center lg:col-span-2 lg:text-left">
            <motion.h1
              {...fadeUp(0)}
              className="text-balance text-5xl font-semibold tracking-tight text-neutral-900 sm:text-6xl lg:text-7xl"
            >
              Your Money, Still Yours.
            </motion.h1>
            <motion.p
              {...fadeUp(0.1)}
              className="mt-6 text-pretty text-base leading-relaxed text-neutral-700 sm:text-lg"
            >
              ClaimIt watches what you bought and quietly gets back what you&apos;re owed.
            </motion.p>
            <motion.div
              {...fadeUp(0.2)}
              className="mt-8 flex flex-col items-center gap-4 sm:flex-row lg:justify-start"
            >
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full gap-2 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600 sm:w-auto inline-flex justify-center items-center ring-1 ring-brand-accent-500/0 hover:ring-brand-accent-500/40 transition-all",
                )}
              >
                Try Free
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/how-it-works"
                className="text-sm text-neutral-700 underline-offset-4 transition-colors hover:text-neutral-900 hover:underline"
              >
                See How It Works
              </Link>
            </motion.div>
          </div>

          <motion.div {...fadeUp(0.3)} className="flex justify-center lg:col-span-3 lg:justify-end">
            {isLoading ? (
              <Skeleton className="aspect-video w-full max-w-2xl rounded-xl" />
            ) : (
              <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl bg-neutral-100 shadow-lg dark:shadow-2xl dark:shadow-black/30">
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                >
                  <source src="/hero-video.webm" type="video/webm" />
                  <source src="/hero-video.mp4" type="video/mp4" />
                </video>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
