"use client";

import { ArrowRight, CircleDashed, Inbox, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

const privacyColumns = [
  {
    title: "Optional",
    icon: CircleDashed,
    body: "Gmail connection is optional. You can always upload receipts manually.",
  },
  {
    title: "Purchase-only",
    icon: Inbox,
    body: "ClaimIt focuses on purchase-related signals only.",
  },
  {
    title: "Approval-first",
    icon: ShieldCheck,
    body: "You approve claims by default before any action is taken.",
  },
] as const;

export function PrivacyControlPreview() {
  return (
    <section className="bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
      >
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Privacy and control
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-neutral-700">
          Optional Gmail, purchase-focused signals, and approval before anything is sent.
        </p>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {privacyColumns.map((column) => (
            <div key={column.title}>
              <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
                <column.icon className="size-5 text-neutral-700" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-medium text-neutral-900">{column.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{column.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/security"
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900"
          >
            Read security details
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
