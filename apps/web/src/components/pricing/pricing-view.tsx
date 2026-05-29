"use client";

import { Calendar, CheckCircle2, CircleCheck, Minus, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlanSelectionDialog } from "@/components/pricing/plan-selection-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type BillingCadence = "monthly" | "annual";
type PlanId = "free" | "pro" | "family";

interface PricingTier {
  id: PlanId;
  name: string;
  badge?: string;
  priceMonthlyLabel: string;
  priceAnnualLabel: string;
  annualSavingsLabel?: string;
  description?: string;
  highlights: string[];
  notIncluded?: string[];
  footnote: string;
  featured?: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    priceMonthlyLabel: "$0",
    priceAnnualLabel: "$0",
    description: "For light monitoring of a few purchases.",
    highlights: ["3 active monitors", "Alert notifications only", "Manual receipt upload"],
    notIncluded: ["Claim drafts"],
    footnote: "Free forever · No credit card required",
  },
  {
    id: "pro",
    name: "Pro",
    badge: "Most popular",
    priceMonthlyLabel: "$4.99 / mo",
    priceAnnualLabel: "$49 / yr",
    annualSavingsLabel: "Annual ~17% off",
    description: "For individuals who want full claim drafts and broader monitoring.",
    highlights: ["Unlimited monitors", "Claim drafts", "Gmail integration", "Assistant support"],
    footnote: "30-day free trial · No credit card required",
    featured: true,
  },
  {
    id: "family",
    name: "Family",
    priceMonthlyLabel: "$9.99 / mo",
    priceAnnualLabel: "$99 / yr",
    annualSavingsLabel: "Annual ~17% off",
    description: "For families who want to use ClaimIt across up to 5 user accounts.",
    highlights: ["Up to 5 users", "All Pro features per user"],
    footnote: "30-day free trial · No credit card required",
  },
];

const ctaLabels: Record<PlanId, string> = {
  free: "Get started — it's free",
  pro: "Continue with Pro",
  family: "Continue with Family",
};

const comparisonFeatures = [
  {
    name: "Active monitors",
    free: "3",
    pro: "Unlimited",
    family: "Unlimited per user",
  },
  { name: "Alert notifications", free: true, pro: true, family: true },
  { name: "Manual receipt upload", free: true, pro: true, family: true },
  { name: "Gmail integration", free: false, pro: true, family: true },
  { name: "Claim drafts", free: false, pro: true, family: true },
  { name: "Assistant support", free: false, pro: true, family: true },
  { name: "Users", free: "1", pro: "1", family: "Up to 5" },
];

const trialSteps = [
  {
    title: "Day 1 — Start",
    icon: Calendar,
    body: "Choose Pro or Family and begin with full feature access.",
  },
  {
    title: "Day 14 — Explore",
    icon: Sparkles,
    body: "Monitor purchases, review claim drafts, and try Gmail integration.",
  },
  {
    title: "Day 30 — Decide",
    icon: CircleCheck,
    body: "Continue on your plan or stay on Free with 3 monitors.",
  },
] as const;

const faqs = [
  {
    question: "Can I stay on the Free plan forever?",
    answer:
      "Yes, the Free plan is forever free with 3 active monitors and alert notifications only. You can upgrade anytime for more features.",
  },
  {
    question: "Does ClaimIt guarantee refunds?",
    answer:
      "No. ClaimIt helps you monitor price protection windows and prepare claim materials, but refund approval depends on the retailer's policies and decisions.",
  },
  {
    question: "Do I have to use Gmail?",
    answer:
      "No. Gmail integration is an optional feature for Pro and Family plans to automatically import receipts. You can always choose to upload receipts manually.",
  },
  {
    question: "What exactly is included in the Family plan?",
    answer:
      "The Family plan allows up to 5 user accounts, each with all Pro features. It's a shared subscription, not a shared dashboard or collaborative workspace.",
  },
  {
    question: "Is the trial a separate plan tier?",
    answer:
      "No. The 30-day free trial is a promotional offer for the Pro and Family plans, not a separate tier. During the trial, you get full access to all features of the respective plan.",
  },
];

function parsePriceLabel(label: string): { numeric: string; period?: string } {
  const [amountPart, periodPart] = label.split(" / ");
  const numeric = amountPart.replace(/^\$/, "") || "0";
  return { numeric, period: periodPart };
}

function PricingCard({
  tier,
  billingCadence,
  selected,
  onSelect,
  onCtaClick,
}: {
  tier: PricingTier;
  billingCadence: BillingCadence;
  selected: boolean;
  onSelect: (planId: PlanId) => void;
  onCtaClick: (planId: PlanId) => void;
}) {
  const price = billingCadence === "annual" ? tier.priceAnnualLabel : tier.priceMonthlyLabel;
  const showAnnualSavings = billingCadence === "annual" && tier.annualSavingsLabel;
  const { numeric, period } = parsePriceLabel(price);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(tier.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(tier.id);
        }
      }}
      className={cn(
        "relative flex h-full cursor-pointer flex-col transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-sm",
        selected && "shadow-md",
        tier.featured
          ? selected
            ? "bg-brand-primary-50 ring-2 ring-brand-primary-500"
            : "bg-brand-primary-50/50 ring-1 ring-neutral-200 hover:ring-brand-primary-200"
          : selected
            ? "bg-brand-primary-50 ring-2 ring-brand-primary-500"
            : "ring-1 ring-neutral-200 hover:ring-brand-primary-200",
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-neutral-900">{tier.name}</CardTitle>
          {tier.badge ? (
            <Badge className="border-0 bg-brand-primary-100 text-xs text-brand-primary-700">
              {tier.badge}
            </Badge>
          ) : null}
        </div>
        <div className="mt-4">
          <span className="align-top text-lg text-neutral-500">$</span>
          <span className="text-4xl font-semibold tracking-tight text-neutral-900 tabular-nums">
            {numeric}
          </span>
          {period ? <span className="ml-1 text-sm text-neutral-500">/ {period}</span> : null}
        </div>
        <p className="mt-1 min-h-5 text-sm font-medium text-neutral-700">
          {showAnnualSavings ? tier.annualSavingsLabel : "\u00a0"}
        </p>
        <p className="mt-1 min-h-4 text-xs text-neutral-500">
          {billingCadence === "annual" && tier.name !== "Free" ? "Billed annually" : "\u00a0"}
        </p>
        {tier.description ? (
          <CardDescription className="mt-3 min-h-[3.5rem] text-neutral-700">
            {tier.description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-3">
          {tier.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-primary-500" />
              <span className="text-sm text-neutral-700">{highlight}</span>
            </li>
          ))}
          {tier.notIncluded?.map((item) => (
            <li key={item} className="flex items-start gap-2 opacity-60">
              <Minus className="mt-0.5 size-4 shrink-0 text-neutral-400" />
              <span className="text-sm text-neutral-500">{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 border-0 bg-transparent p-4 pt-0">
        <Button
          type="button"
          size="lg"
          variant={tier.featured ? "default" : "outline"}
          className={cn(
            "w-full",
            tier.featured
              ? "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
              : "border-neutral-200 text-neutral-700 hover:bg-neutral-50",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onCtaClick(tier.id);
          }}
        >
          {ctaLabels[tier.id]}
        </Button>
        <p className="text-center text-xs text-neutral-500">{tier.footnote}</p>
      </CardFooter>
    </Card>
  );
}

function FeatureComparisonTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-neutral-50">
            <TableHead className="w-[40%] text-neutral-900">Feature</TableHead>
            <TableHead className="w-[20%] text-center text-neutral-900">Free</TableHead>
            <TableHead className="w-[20%] text-center text-neutral-900">Pro</TableHead>
            <TableHead className="w-[20%] text-center text-neutral-900">Family</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisonFeatures.map((feature) => (
            <TableRow key={feature.name}>
              <TableCell className="font-medium text-neutral-700">{feature.name}</TableCell>
              <TableCell className="w-[20%] text-center">
                {typeof feature.free === "boolean" ? (
                  feature.free ? (
                    <CheckCircle2 className="mx-auto size-4 text-brand-primary-500" />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )
                ) : (
                  <span className="text-sm text-neutral-700">{feature.free}</span>
                )}
              </TableCell>
              <TableCell className="w-[20%] text-center">
                {typeof feature.pro === "boolean" ? (
                  feature.pro ? (
                    <CheckCircle2 className="mx-auto size-4 text-brand-primary-500" />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )
                ) : (
                  <span className="text-sm text-neutral-700">{feature.pro}</span>
                )}
              </TableCell>
              <TableCell className="w-[20%] whitespace-normal text-center">
                {typeof feature.family === "boolean" ? (
                  feature.family ? (
                    <CheckCircle2 className="mx-auto size-4 text-brand-primary-500" />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )
                ) : (
                  <span className="text-sm text-neutral-700">{feature.family}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PricingFAQ() {
  return (
    <Accordion multiple={false}>
      {faqs.map((faq) => (
        <AccordionItem key={faq.question} value={faq.question}>
          <AccordionTrigger className="text-left text-base font-medium text-neutral-900">
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className="text-base leading-relaxed text-neutral-700">
            {faq.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function PricingView() {
  const router = useRouter();
  const [billingCadence, setBillingCadence] = useState<BillingCadence>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("pro");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<"pro" | "family">("pro");

  const handleCtaClick = (plan: PlanId) => {
    if (plan === "free") {
      router.push("/login?plan=free");
      return;
    }
    setPendingPlan(plan);
    setDialogOpen(true);
  };

  return (
    <div className="bg-neutral-0">
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-balance text-4xl font-semibold leading-[0.95] tracking-tighter text-neutral-900 sm:text-5xl lg:text-6xl">
            Pricing
          </h1>
          <p className="mt-4 text-base leading-relaxed text-neutral-600 sm:text-lg">
            ClaimIt offers a forever-free tier. Paid plans unlock broader monitoring and claim
            drafts. We help you prepare materials, but we do not guarantee refunds.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className={cn(
                buttonVariants(),
                "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
              )}
            >
              Get Started Free
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm font-medium text-neutral-700 hover:text-neutral-900"
            >
              See how it works →
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
        >
          <div className="mb-10 flex justify-center">
            <Tabs
              value={billingCadence}
              onValueChange={(value) => setBillingCadence(value as BillingCadence)}
            >
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="annual">Annual</TabsTrigger>
              </TabsList>
              <TabsContent value="monthly" className="hidden" aria-hidden />
              <TabsContent value="annual" className="hidden" aria-hidden />
            </Tabs>
          </div>

          <div className="grid items-stretch gap-6 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <PricingCard
                key={tier.id}
                tier={tier}
                billingCadence={billingCadence}
                selected={selectedPlan === tier.id}
                onSelect={setSelectedPlan}
                onCtaClick={handleCtaClick}
              />
            ))}
          </div>

          <div className="mt-16">
            <h2 className="text-balance text-center text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              Compare features in detail
            </h2>
            <div className="mt-8">
              <FeatureComparisonTable />
            </div>
          </div>
        </motion.div>
      </section>

      <section className="py-24 sm:py-32 lg:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        >
          <h2 className="text-balance text-center text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            How the 30-day trial works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-neutral-700">
            Full Pro or Family access. No credit card required.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {trialSteps.map((step) => (
              <div key={step.title}>
                <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
                  <step.icon className="size-5 text-neutral-700" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-medium text-neutral-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{step.body}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="py-24 sm:py-32 lg:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8"
        >
          <h2 className="text-balance mb-8 text-center text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <PricingFAQ />
        </motion.div>
      </section>

      <section className="bg-neutral-0 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Start with One Receipt
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-neutral-700">
            Upload a purchase receipt or connect Gmail, and review when claim materials are ready.
          </p>
          <Link href="/login" className={cn(buttonVariants(), "mt-6 inline-flex")}>
            Get Started Free
          </Link>
        </div>
      </section>

      <PlanSelectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        plan={pendingPlan}
        billing={billingCadence}
      />
    </div>
  );
}
