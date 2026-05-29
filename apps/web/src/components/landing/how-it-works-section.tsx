"use client";

import {
  CheckCircle2,
  Eye,
  FileCheck,
  FileText,
  MessageSquareText,
  Minimize2,
  Sparkles,
  Upload,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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

function StepThreePreviewPanel() {
  return (
    <div className="mt-10 mx-auto max-w-4xl">
      <p className="text-center text-sm text-neutral-500">See Step 3 in action</p>
      <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" className="border-neutral-200 text-neutral-700 gap-2">
            <Sparkles className="size-4 shrink-0" aria-hidden />
            Explain Why
          </Button>
          <Button variant="outline" size="sm" className="border-neutral-200 text-neutral-700 gap-2">
            <Minimize2 className="size-4 shrink-0" aria-hidden />
            Make Shorter
          </Button>
          <Button variant="outline" size="sm" className="border-neutral-200 text-neutral-700 gap-2">
            <Eye className="size-4 shrink-0" aria-hidden />
            Review Draft
          </Button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="border-neutral-200 bg-neutral-0 p-0">
            <div className="border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquareText className="size-4 shrink-0 text-brand-primary-500" aria-hidden />
                <span className="text-sm font-medium text-neutral-900">Assistant</span>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-neutral-700">
                I detected a price drop of $42.00 at BestBuy. The item is within the 30-day price
                protection window. I&apos;ve prepared an email draft based on their online form
                format.
              </p>
            </div>
          </Card>

          <Card className="border-neutral-200 bg-neutral-0 p-0">
            <div className="border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-neutral-500" aria-hidden />
                  <span className="text-sm font-medium text-neutral-900">Claim Draft</span>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 border-neutral-200 bg-neutral-0 text-neutral-700"
                >
                  Pending Review
                </Badge>
              </div>
            </div>
            <div className="p-4">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500">Merchant</span>
                  <span className="text-neutral-900">BestBuy</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500">Type</span>
                  <span className="text-neutral-900">Email Draft</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500">Difference</span>
                  <span className="text-neutral-900">$42.00</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
                >
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
                >
                  Edit
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
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
            <StepThreePreviewPanel />
          </>
        )}

        <div className="mt-10 flex justify-center text-center">
          <Link
            href="/how-it-works"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 inline-flex px-6 ring-1 ring-brand-accent-500/0 hover:ring-brand-accent-500/40 transition-all",
            )}
          >
            Learn How It Works
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
