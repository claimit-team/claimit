"use client";

import { Eye, FileCheck, Upload } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { ClaimDetailDemo } from "@/components/landing/claim-detail-demo";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface HowItWorksSectionProps {
  isLoading?: boolean;
}

const steps = [
  {
    icon: Upload,
    title: "Upload or Connect Gmail",
    description:
      "Manually add receipts (PDF/PNG/JPG) or connect Gmail to auto-detect order confirmation emails. Both methods work equally well.",
  },
  {
    icon: Eye,
    title: "Monitor",
    description:
      "ClaimIt watches supported policy windows and price changes, alerting you when an eligible price drop is detected.",
  },
  {
    icon: FileCheck,
    title: "Claim",
    description:
      "When eligible, ClaimIt prepares claim material for your review. The assistant explains why, helps refine wording, and keeps approval gating on by default.",
  },
] as const;

function StepCard({ step, index }: { step: (typeof steps)[number]; index: number }) {
  return (
    <Card className="flex h-full flex-col border-neutral-200 bg-neutral-0 p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
          <step.icon className="size-5 text-brand-primary-500" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-neutral-500">Step {index + 1}</span>
          <h3 className="mt-1 text-base font-semibold text-neutral-900">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">{step.description}</p>
        </div>
      </div>
    </Card>
  );
}

export function HowItWorksSection({ isLoading = false }: HowItWorksSectionProps) {
  return (
    <section className="py-24 sm:py-32 lg:py-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          How It Works
        </h2>

        {isLoading ? (
          <>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-neutral-200 bg-neutral-0 p-6">
                  <Skeleton className="mb-4 size-10 rounded-lg" />
                  <Skeleton className="mb-2 h-5 w-3/4 max-w-[10rem]" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-full max-w-[11rem]" />
                </Card>
              ))}
            </div>
            <Card className="mt-10 border-neutral-200 bg-neutral-0 p-6">
              <Skeleton className="h-64 w-full" />
            </Card>
          </>
        ) : (
          <>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {steps.map((step, index) => (
                <StepCard key={step.title} step={step} index={index} />
              ))}
            </div>
            <ClaimDetailDemo />
          </>
        )}

        <div className="mt-10 flex justify-center text-center">
          <Link
            href="/how-it-works"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex px-6 ring-1 ring-brand-accent-500/0 transition-all hover:ring-brand-accent-500/40 border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900",
            )}
          >
            Learn How It Works
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
