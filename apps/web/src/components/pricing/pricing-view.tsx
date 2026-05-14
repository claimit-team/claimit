"use client";

import { CheckCircle2, Minus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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

interface PricingTier {
  name: string;
  badge?: string;
  priceMonthlyLabel: string;
  priceAnnualLabel: string;
  tagline?: string;
  annualSavingsLabel?: string;
  description?: string;
  highlights: string[];
  notIncluded?: string[];
  promo?: string;
  cta: { label: string; href: string };
  featured?: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    priceMonthlyLabel: "$0",
    priceAnnualLabel: "$0",
    tagline: "Free forever",
    description: "For light monitoring of a few purchases.",
    highlights: ["3 active monitors", "Alert notifications only", "Manual receipt upload"],
    notIncluded: ["Claim drafts"],
    cta: { label: "Get Started Free", href: "/login" },
  },
  {
    name: "Pro",
    badge: "Most popular",
    priceMonthlyLabel: "$4.99 / mo",
    priceAnnualLabel: "$49 / yr",
    annualSavingsLabel: "Annual ~17% off",
    description: "For individuals who want full claim drafts and broader monitoring.",
    highlights: ["Unlimited monitors", "Claim drafts", "Gmail integration", "Assistant support"],
    promo: "30-day free trial · No credit card required",
    cta: { label: "Start Pro trial", href: "/login" },
    featured: true,
  },
  {
    name: "Family",
    priceMonthlyLabel: "$9.99 / mo",
    priceAnnualLabel: "$99 / yr",
    annualSavingsLabel: "Annual ~17% off",
    description: "For families who want to use ClaimIt across up to 5 user accounts.",
    highlights: ["Up to 5 users", "All Pro features per user"],
    promo: "30-day free trial · No credit card required",
    cta: { label: "Start Family trial", href: "/login" },
  },
];

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

function PricingCard({
  tier,
  billingCadence,
}: {
  tier: PricingTier;
  billingCadence: BillingCadence;
}) {
  const price = billingCadence === "annual" ? tier.priceAnnualLabel : tier.priceMonthlyLabel;
  const showAnnualSavings = billingCadence === "annual" && tier.annualSavingsLabel;

  return (
    <Card
      className={cn("relative flex flex-col", tier.featured && "ring-2 ring-brand-primary-500")}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-neutral-900">{tier.name}</CardTitle>
          {tier.badge ? (
            <Badge variant="secondary" className="text-xs">
              {tier.badge}
            </Badge>
          ) : null}
        </div>
        <div className="mt-4">
          <span className="text-3xl font-semibold text-neutral-900 tabular-nums">
            {price.split(" ")[0]}
          </span>
          {price.includes("/") ? (
            <span className="ml-1 text-sm text-neutral-700">/ {price.split("/ ")[1]}</span>
          ) : null}
          {tier.tagline && !price.includes("/") ? (
            <span className="ml-2 text-sm text-neutral-700">{tier.tagline}</span>
          ) : null}
        </div>
        {showAnnualSavings ? (
          <p className="mt-1 text-sm font-medium text-neutral-700">{tier.annualSavingsLabel}</p>
        ) : null}
        {billingCadence === "annual" && tier.name !== "Free" ? (
          <p className="mt-1 text-xs text-neutral-500">Billed annually</p>
        ) : null}
        {tier.description ? (
          <CardDescription className="mt-3 text-neutral-700">{tier.description}</CardDescription>
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
      <CardFooter className="flex flex-col gap-2">
        <Link
          href={tier.cta.href}
          className={cn(
            buttonVariants({
              variant: tier.featured ? "default" : "outline",
            }),
            "w-full",
          )}
        >
          {tier.cta.label}
        </Link>
        {tier.promo ? <p className="text-center text-xs text-neutral-500">{tier.promo}</p> : null}
      </CardFooter>
    </Card>
  );
}

function FeatureComparisonTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200">
      <Table>
        <TableHeader>
          <TableRow className="bg-neutral-50">
            <TableHead className="w-[40%] text-neutral-900">Feature</TableHead>
            <TableHead className="text-center text-neutral-900">Free</TableHead>
            <TableHead className="text-center text-neutral-900">Pro</TableHead>
            <TableHead className="text-center text-neutral-900">Family</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisonFeatures.map((feature) => (
            <TableRow key={feature.name}>
              <TableCell className="font-medium text-neutral-700">{feature.name}</TableCell>
              <TableCell className="text-center">
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
              <TableCell className="text-center">
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
              <TableCell className="text-center">
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

function TrialExplanation() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-neutral-900">How the 30-Day Trial Works</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm text-neutral-700">
          <li>• The trial applies to Pro and Family plans</li>
          <li>• No credit card required to start your trial</li>
          <li>• The trial is a promotional offer for these plans, not a separate tier</li>
          <li>• Full feature access during the trial period</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function PricingFAQ() {
  return (
    <Accordion multiple={false}>
      {faqs.map((faq) => (
        <AccordionItem key={faq.question} value={faq.question}>
          <AccordionTrigger className="text-left text-neutral-900">{faq.question}</AccordionTrigger>
          <AccordionContent className="text-neutral-700">{faq.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function PricingView() {
  const [billingCadence, setBillingCadence] = useState<BillingCadence>("monthly");

  return (
    <div className="bg-neutral-0">
      <section className="border-b border-neutral-200 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Pricing</h1>
          <p className="mt-4 text-lg text-neutral-700">
            ClaimIt offers a forever-free tier. Paid plans unlock broader monitoring and claim
            drafts. We help you prepare materials, but we do not guarantee refunds.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login" className={cn(buttonVariants())}>
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

      <section className="py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
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

          <div className="grid gap-6 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <PricingCard key={tier.name} tier={tier} billingCadence={billingCadence} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-200 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center text-2xl font-semibold text-neutral-900">
            Feature Comparison
          </h2>
          <FeatureComparisonTable />
        </div>
      </section>

      <section className="border-t border-neutral-200 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
          <TrialExplanation />
        </div>
      </section>

      <section className="border-t border-neutral-200 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-center text-2xl font-semibold text-neutral-900">
            Frequently Asked Questions
          </h2>
          <PricingFAQ />
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-neutral-50 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-neutral-900">Start with One Receipt</h2>
          <p className="mt-4 text-neutral-700">
            Upload a purchase receipt or connect Gmail, and review when claim materials are ready.
          </p>
          <Link href="/login" className={cn(buttonVariants(), "mt-6 inline-flex")}>
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}
